import {
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'node:stream';

import { Asset, type StorageConfig } from './types';

/**
 * Espelho das releases num bucket S3/R2.
 *
 * Existe por um motivo só: as URLs do GitHub carregam o `response-content-
 * disposition` DENTRO da assinatura, então não há como servir o mesmo binário
 * com um nome de arquivo próprio redirecionando para lá. Com o arquivo num
 * bucket próprio, uma presigned URL resolve isso sem que nenhum byte passe por
 * este servidor.
 *
 * É uma cópia por release, não por download.
 */

/** Validade da URL assinada. Curta: ela é gerada no clique do usuário. */
const SIGNED_URL_TTL_SECONDS = 15 * 60;

/** Formato aceito para a etiqueta: opaca, sem espaço nem caractere de path. */
const TAG_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

export const isValidTag = (value: string) => TAG_PATTERN.test(value);

/**
 * Prefixo da etiqueta no nome do arquivo. Configurável porque o cliente que lê
 * esse nome precisa combinar com ele, e o par pode ser rotacionado sem release.
 */
export const tagPrefix = () => process.env.INSTALLER_TAG_PREFIX ?? 'build-';

/**
 * `Meu.App.-.v1.2.3.exe` + etiqueta → `Meu.App.-.v1.2.3 [<prefixo><etiqueta>].exe`
 */
export const buildTaggedFilename = (assetName: string, tag: string) => {
  const safeName = assetName.replace(/["\r\n]/g, '');
  const extensionAt = safeName.lastIndexOf('.');

  const base = extensionAt === -1 ? safeName : safeName.slice(0, extensionAt);
  const extension = extensionAt === -1 ? '' : safeName.slice(extensionAt);

  return `${base} [${tagPrefix()}${tag}]${extension}`;
};

/**
 * O repositório entra na chave para que múltiplos deploys deste serviço, cada um
 * lendo um repositório de releases diferente, possam dividir o mesmo bucket sem
 * risco de um sobrescrever o outro.
 */
export const buildObjectKey = (
  prefix: string | undefined,
  repository: string,
  version: string,
  assetName: string,
) => `${prefix ?? 'releases'}/${repository}/${version}/${assetName}`;

export default class Mirror {
  private readonly config: StorageConfig;

  private readonly repository: string;

  private readonly githubToken?: string;

  private readonly s3?: S3Client;

  /** Chaves já confirmadas no bucket — evita um HeadObject por request. */
  private readonly mirrored = new Set<string>();

  /** Cópias em andamento, para duas requisições não subirem o mesmo arquivo. */
  private readonly inFlight = new Set<string>();

  constructor(
    config: StorageConfig,
    repository?: string,
    githubToken?: string,
  ) {
    this.config = config;
    this.repository = repository ?? 'unknown';
    this.githubToken = githubToken;

    if (!this.isConfigured) return;

    this.s3 = new S3Client({
      region: config.region ?? 'auto',
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId!,
        secretAccessKey: config.secretAccessKey!,
      },
    });
  }

  /**
   * Sem bucket configurado o espelho fica inteiro desligado e as rotas caem no
   * redirect de sempre. Permite subir o código antes de existir a infra.
   */
  get isConfigured() {
    const { bucket, accessKeyId, secretAccessKey } = this.config;
    return Boolean(bucket && accessKeyId && secretAccessKey);
  }

  private objectKey(version: string, assetName: string) {
    return buildObjectKey(
      this.config.prefix,
      this.repository,
      version,
      assetName,
    );
  }

  private async exists(key: string) {
    if (this.mirrored.has(key)) return true;

    try {
      await this.s3!.send(
        new HeadObjectCommand({ Bucket: this.config.bucket!, Key: key }),
      );
      this.mirrored.add(key);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Copia o asset para o bucket se ainda não estiver lá. Chamada sem await
   * pelas rotas: a primeira pessoa a baixar depois de um release novo cai no
   * redirect normal (sem etiqueta) enquanto a cópia acontece.
   */
  async ensureMirrored(version: string, asset: Asset): Promise<void> {
    if (!this.isConfigured) return;

    const key = this.objectKey(version, asset.name);

    // Reserva ANTES de qualquer await. Se o `exists()` viesse primeiro, todas as
    // requisições concorrentes cederiam o event loop no HeadObject e passariam
    // pelo guard juntas — cada uma baixando ~150 MB do GitHub e abrindo um
    // upload multipart. No dia de uma release isso derruba o dyno, que é o mesmo
    // que serve o canal de update de toda a base instalada.
    if (this.inFlight.has(key)) return;

    this.inFlight.add(key);

    try {
      if (await this.exists(key)) return;

      const headers: Record<string, string> = {
        Accept: 'application/octet-stream',
      };

      if (this.githubToken) {
        headers.Authorization = `token ${this.githubToken}`;
      }

      const response = await fetch(
        this.githubToken ? asset.api_url : asset.url,
        { headers },
      );

      if (!response.ok || !response.body) {
        // Sem cancelar, cada falha repetida (rate limit, token expirado) deixa
        // uma conexão pendurada.
        await response.body?.cancel();
        throw new Error(`GitHub respondeu ${response.status}`);
      }

      await new Upload({
        client: this.s3!,
        params: {
          Bucket: this.config.bucket!,
          Key: key,
          Body: Readable.fromWeb(response.body as never),
          ContentType: asset.content_type || 'application/octet-stream',
        },
      }).done();

      this.mirrored.add(key);
      console.log(`[mirror] espelhado ${key}`);
    } catch (err) {
      console.error(`[mirror] falha ao espelhar ${key}:`, err);
    } finally {
      this.inFlight.delete(key);
    }
  }

  /**
   * URL assinada que força o download com a etiqueta no nome do arquivo.
   * Devolve null quando o espelho não está pronto — quem chama cai no redirect
   * normal e o usuário recebe o mesmo binário, só sem a etiqueta.
   *
   * A etiqueta é opaca para este serviço e pode carregar dado sensível de quem
   * chamou: NÃO logar.
   */
  async getTaggedUrl(
    version: string,
    asset: Asset,
    tag: string,
  ): Promise<string | null> {
    if (!this.isConfigured || !isValidTag(tag)) return null;

    const key = this.objectKey(version, asset.name);

    if (!(await this.exists(key))) return null;

    const filename = buildTaggedFilename(asset.name, tag);

    return getSignedUrl(
      this.s3!,
      new GetObjectCommand({
        Bucket: this.config.bucket!,
        Key: key,
        ResponseContentDisposition: `attachment; filename="${filename}"`,
      }),
      { expiresIn: SIGNED_URL_TTL_SECONDS },
    );
  }
}
