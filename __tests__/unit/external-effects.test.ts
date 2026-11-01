import { __setMockEnv, __resetMocks } from '../../__mocks__/opennextjs-cloudflare';
import { createAutentiqueDocumentFromHtml, createAutentiqueSignatureLink } from '@/lib/integrations/autentique/client';

afterEach(() => { __resetMocks(); jest.restoreAllMocks(); });

test('validação isolada não envia documentos nem solicita links externos', async () => {
  __setMockEnv({ ENVIRONMENT: 'refactor', EXTERNAL_SIDE_EFFECTS_ENABLED: 'true' });
  const network = jest.spyOn(globalThis, 'fetch');
  await expect(createAutentiqueDocumentFromHtml({ title: 'Teste', html: '<p>Teste</p>', signer: { name: 'Fictício' } })).rejects.toThrow('Integrações externas desativadas');
  await expect(createAutentiqueSignatureLink('ficticio')).rejects.toThrow('Integrações externas desativadas');
  expect(network).not.toHaveBeenCalled();
});

test('bloqueio explícito também funciona fora do ambiente refactor', async () => {
  __setMockEnv({ ENVIRONMENT: 'staging', EXTERNAL_SIDE_EFFECTS_ENABLED: 'false' });
  const network = jest.spyOn(globalThis, 'fetch');
  await expect(createAutentiqueSignatureLink('ficticio')).rejects.toThrow('Integrações externas desativadas');
  expect(network).not.toHaveBeenCalled();
});
