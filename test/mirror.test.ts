/* global describe, it, expect */
import Mirror, {
  buildObjectKey,
  buildTaggedFilename,
  isValidTag,
} from '../src/lib/mirror';
import { Asset } from '../src/lib/types';

// O GitHub troca espaços por pontos no nome do asset ao publicar a release,
// então é assim que ele chega aqui.
const asset: Asset = {
  name: 'Meu.App.-.v1.2.3.exe',
  api_url: 'https://api.github.com/repos/x/y/releases/assets/1',
  url: 'https://github.com/x/y/releases/download/v1.2.3/setup.exe',
  content_type: 'application/octet-stream',
  size: 150,
};

describe('buildTaggedFilename', () => {
  it('insere a etiqueta antes da extensão', () => {
    expect(buildTaggedFilename(asset.name, 'abc123')).toBe(
      'Meu.App.-.v1.2.3 [build-abc123].exe',
    );
  });

  it('funciona com qualquer nome de asset', () => {
    expect(buildTaggedFilename('Outro.App.-.v1.2.3.exe', 'abc123')).toBe(
      'Outro.App.-.v1.2.3 [build-abc123].exe',
    );
  });

  it('lida com nome sem extensão', () => {
    expect(buildTaggedFilename('Setup', 'abc')).toBe('Setup [build-abc]');
  });

  it('remove aspas e quebras de linha, que quebrariam o header', () => {
    expect(buildTaggedFilename('Se"tup\r\n.exe', 'abc')).toBe(
      'Setup [build-abc].exe',
    );
  });
});

describe('buildObjectKey', () => {
  it('separa deploys distintos que leem repositorios diferentes', () => {
    const first = buildObjectKey(
      undefined,
      'owner/app-releases',
      'v1.2.3',
      'Meu.App.-.v1.2.3.exe',
    );
    const second = buildObjectKey(
      undefined,
      'owner/other-releases',
      'v1.2.3',
      'Outro.App.-.v1.2.3.exe',
    );

    expect(first).toBe(
      'releases/owner/app-releases/v1.2.3/Meu.App.-.v1.2.3.exe',
    );
    expect(second).toBe(
      'releases/owner/other-releases/v1.2.3/Outro.App.-.v1.2.3.exe',
    );
    expect(first).not.toBe(second);
  });

  it('respeita o prefixo configurado', () => {
    expect(buildObjectKey('installers', 'repo', 'v1', 'a.exe')).toBe(
      'installers/repo/v1/a.exe',
    );
  });
});

describe('isValidTag', () => {
  it('aceita base64url no tamanho esperado', () => {
    expect(isValidTag('4f3Aq-_ZxY7bK1nP2sTuVw')).toBe(true);
  });

  it('recusa etiqueta curta, vazia ou com caractere fora do alfabeto', () => {
    expect(isValidTag('')).toBe(false);
    expect(isValidTag('curto')).toBe(false);
    expect(isValidTag('tem espaco no meio dele')).toBe(false);
    expect(isValidTag('../../etc/passwd/aaaaaaaaaa')).toBe(false);
  });
});

describe('Mirror sem storage configurado', () => {
  const mirror = new Mirror({}, 'owner/app-releases');

  it('fica desligado', () => {
    expect(mirror.isConfigured).toBe(false);
  });

  it('não gera URL, para o chamador cair no redirect normal', async () => {
    const url = await mirror.getTaggedUrl(
      'v1.2.3',
      asset,
      '4f3Aq-_ZxY7bK1nP2sTuVw',
    );

    expect(url).toBeNull();
  });

  it('não tenta espelhar', async () => {
    await expect(
      mirror.ensureMirrored('v1.2.3', asset),
    ).resolves.toBeUndefined();
  });
});
