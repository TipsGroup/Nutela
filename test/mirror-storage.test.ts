/* global describe, it, expect, jest, beforeEach, afterEach */
import { Readable } from 'node:stream';
import Mirror from '../src/lib/mirror';
import { Asset } from '../src/lib/types';

const mockSend = jest.fn();
const mockUploadDone = jest.fn();
const mockGetSignedUrl = jest.fn();
const mockUploadCtor = jest.fn();

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: mockSend })),
  HeadObjectCommand: jest.fn().mockImplementation(input => ({
    name: 'HeadObject',
    input,
  })),
  GetObjectCommand: jest.fn().mockImplementation(input => ({
    name: 'GetObject',
    input,
  })),
}));

jest.mock('@aws-sdk/lib-storage', () => ({
  Upload: jest.fn().mockImplementation(params => {
    mockUploadCtor(params);
    return { done: mockUploadDone };
  }),
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: (...args: unknown[]) => mockGetSignedUrl(...args),
}));

const STORAGE = {
  bucket: 'releases-bucket',
  accessKeyId: 'key',
  secretAccessKey: 'secret',
  endpoint: 'https://r2.example',
};

const REPO = 'owner/app-releases';
const VERSION = 'v1.2.3';
const TOKEN = '4f3Aq-_ZxY7bK1nP2sTuVw';

const asset: Asset = {
  name: 'Meu.App.-.v1.2.3.exe',
  api_url: 'https://api.github.com/repos/x/y/releases/assets/1',
  url: 'https://github.com/x/y/releases/download/v1.2.3/setup.exe',
  content_type: 'application/octet-stream',
  size: 150,
};

const EXPECTED_KEY = `releases/${REPO}/${VERSION}/${asset.name}`;

/** Um HeadObject que rejeita = objeto ainda não espelhado. */
const notMirrored = () => mockSend.mockRejectedValue(new Error('NotFound'));
const alreadyMirrored = () => mockSend.mockResolvedValue({});

function fakeGithubResponse() {
  return {
    ok: true,
    status: 200,
    body: Readable.toWeb(Readable.from(['conteudo-do-binario'])),
  };
}

describe('Mirror com storage configurado', () => {
  let mirror: Mirror;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mirror = new Mirror(STORAGE, REPO, 'github-token');
    fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockImplementation(async () => fakeGithubResponse() as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getTaggedUrl', () => {
    it('assina a URL forçando o filename com a etiqueta', async () => {
      alreadyMirrored();
      mockGetSignedUrl.mockResolvedValue('https://r2.example/assinada');

      const url = await mirror.getTaggedUrl(VERSION, asset, TOKEN);

      expect(url).toBe('https://r2.example/assinada');

      const [, command] = mockGetSignedUrl.mock.calls[0];
      expect(command.input).toMatchObject({
        Bucket: STORAGE.bucket,
        Key: EXPECTED_KEY,
        ResponseContentDisposition: `attachment; filename="Meu.App.-.v1.2.3 [build-${TOKEN}].exe"`,
      });
    });

    it('assina com validade curta', async () => {
      alreadyMirrored();
      mockGetSignedUrl.mockResolvedValue('https://r2.example/assinada');

      await mirror.getTaggedUrl(VERSION, asset, TOKEN);

      const [, , options] = mockGetSignedUrl.mock.calls[0];
      expect(options.expiresIn).toBeLessThanOrEqual(15 * 60);
    });

    it('recusa etiqueta fora do formato, sem chegar a assinar', async () => {
      alreadyMirrored();

      const url = await mirror.getTaggedUrl(VERSION, asset, 'curto');

      expect(url).toBeNull();
      expect(mockGetSignedUrl).not.toHaveBeenCalled();
    });

    it('devolve null quando a release ainda não foi espelhada', async () => {
      notMirrored();

      const url = await mirror.getTaggedUrl(VERSION, asset, TOKEN);

      // Quem chama cai no redirect normal: o usuário baixa o mesmo binário,
      // só sem a etiqueta.
      expect(url).toBeNull();
      expect(mockGetSignedUrl).not.toHaveBeenCalled();
    });
  });

  describe('ensureMirrored', () => {
    it('copia para a chave que separa repositório e versão', async () => {
      notMirrored();
      mockUploadDone.mockResolvedValue({});

      await mirror.ensureMirrored(VERSION, asset);

      expect(mockUploadCtor).toHaveBeenCalledTimes(1);
      expect(mockUploadCtor.mock.calls[0][0].params).toMatchObject({
        Bucket: STORAGE.bucket,
        Key: EXPECTED_KEY,
      });
    });

    it('não copia de novo o que já está no bucket', async () => {
      alreadyMirrored();

      await mirror.ensureMirrored(VERSION, asset);

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(mockUploadCtor).not.toHaveBeenCalled();
    });

    it('sob concorrência, baixa e sobe uma única vez', async () => {
      // Sem a reserva antes do await, todas as chamadas cediam o event loop no
      // HeadObject e passavam juntas — cada uma baixando o binário inteiro.
      notMirrored();
      mockUploadDone.mockResolvedValue({});

      await Promise.all(
        Array.from({ length: 20 }, () => mirror.ensureMirrored(VERSION, asset)),
      );

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(mockUploadCtor).toHaveBeenCalledTimes(1);
    });

    it('usa a api_url autenticada quando há credencial do GitHub', async () => {
      notMirrored();
      mockUploadDone.mockResolvedValue({});

      await mirror.ensureMirrored(VERSION, asset);

      const [url, init] = fetchSpy.mock.calls[0];
      expect(url).toBe(asset.api_url);
      expect(init.headers.Authorization).toBe('token github-token');
    });

    it('não deixa a falha do GitHub derrubar o processo', async () => {
      notMirrored();
      fetchSpy.mockResolvedValue({
        ok: false,
        status: 404,
        body: null,
      } as never);

      await expect(
        mirror.ensureMirrored(VERSION, asset),
      ).resolves.toBeUndefined();
      expect(mockUploadCtor).not.toHaveBeenCalled();
    });

    it('não deixa a falha do upload derrubar o processo', async () => {
      notMirrored();
      mockUploadDone.mockRejectedValue(new Error('R2 fora'));

      await expect(
        mirror.ensureMirrored(VERSION, asset),
      ).resolves.toBeUndefined();
    });

    it('libera a reserva depois de falhar, para a próxima tentativa', async () => {
      notMirrored();
      mockUploadDone.mockRejectedValueOnce(new Error('R2 fora'));
      await mirror.ensureMirrored(VERSION, asset);

      mockUploadDone.mockResolvedValue({});
      await mirror.ensureMirrored(VERSION, asset);

      expect(mockUploadCtor).toHaveBeenCalledTimes(2);
    });
  });
});

describe('isConfigured', () => {
  it.each([
    ['sem bucket', { ...STORAGE, bucket: undefined }],
    ['sem access key', { ...STORAGE, accessKeyId: undefined }],
    ['sem secret', { ...STORAGE, secretAccessKey: undefined }],
  ])('fica desligado %s', (_label, storage) => {
    // O README promete que as três são obrigatórias para ligar o espelho.
    expect(new Mirror(storage, REPO).isConfigured).toBe(false);
  });

  it('liga com as três presentes', () => {
    expect(new Mirror(STORAGE, REPO).isConfigured).toBe(true);
  });
});
