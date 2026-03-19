import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { ZodError } from 'zod';
import { loadConfig, type SignerConfig } from './config';
import { parseAttestationRequest } from './schema';
import { DEFAULT_ATTESTATION_NONCE, signAttestation } from './sign-attestation';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

export interface CreateSignerServerOptions {
  config?: SignerConfig;
}

export interface SignerServerHandle {
  listen(port?: number, host?: string): Promise<{ port: number; host: string }>;
  close(): Promise<void>;
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 1_048_576) {
      throw new Error('Request body too large');
    }
    chunks.push(buffer);
  }

  if (chunks.length === 0) {
    return {};
  }

  const text = Buffer.concat(chunks).toString('utf8');
  return JSON.parse(text);
}

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  const payload = Buffer.from(JSON.stringify(body));
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(payload.length),
  });
  res.end(payload);
}

function getBearerToken(header: string | string[] | undefined): string | null {
  if (typeof header !== 'string') {
    return null;
  }

  const match = /^Bearer\s+(.+)$/.exec(header.trim());
  return match ? match[1] : null;
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  config: SignerConfig,
): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost');

  if (url.pathname !== '/attestation') {
    sendJson(res, 404, { error: 'Not found' });
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST');
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  const bearer = getBearerToken(req.headers.authorization);
  if (!bearer) {
    sendJson(res, 401, { error: 'Missing authorization' });
    return;
  }

  if (bearer !== config.signerSecret) {
    sendJson(res, 403, { error: 'Invalid authorization' });
    return;
  }

  try {
    const body = await readJsonBody(req);
    const parsed = parseAttestationRequest(body);
    const attestation = signAttestation(
      config,
      {
        xUserId: parsed.xUserId,
        suiAddress: parsed.suiAddress,
        nonce: DEFAULT_ATTESTATION_NONCE,
      },
      { nowMs: Date.now() },
    );

    sendJson(res, 200, attestation);
  } catch (error) {
    if (error instanceof SyntaxError) {
      sendJson(res, 400, { error: 'Invalid JSON body' });
      return;
    }

    if (error instanceof ZodError) {
      sendJson(res, 400, { error: 'Invalid request body' });
      return;
    }

    if (error instanceof Error && error.message.startsWith('Invalid ')) {
      sendJson(res, 400, { error: error.message });
      return;
    }

    console.error('Unexpected attestation error', error);
    sendJson(res, 500, { error: 'Internal server error' });
  }
}

export async function createSignerServer(
  options: CreateSignerServerOptions = {},
): Promise<SignerServerHandle> {
  const config = options.config ?? loadConfig();
  const server = createServer((req, res) => {
    void handleRequest(req, res, config);
  });

  return {
    listen(port = config.port, host = config.host) {
      return new Promise((resolvePromise, rejectPromise) => {
        const onError = (error: Error) => {
          server.off('error', onError);
          rejectPromise(error);
        };

        server.once('error', onError);
        server.listen(port, host, () => {
          server.off('error', onError);
          const address = server.address();
          if (typeof address === 'object' && address) {
            resolvePromise({ port: address.port, host: address.address });
            return;
          }

          rejectPromise(new Error('Unable to determine listening address'));
        });
      });
    },
    close() {
      return new Promise((resolvePromise, rejectPromise) => {
        server.close((error) => {
          if (error) {
            rejectPromise(error);
            return;
          }

          resolvePromise();
        });
      });
    },
  };
}

async function main(): Promise<void> {
  const config = loadConfig();
  console.log(`Nautilus signer public key: ${config.publicKeyHex}`);
  const server = await createSignerServer({ config });
  const address = await server.listen();
  console.log(`Nautilus signer listening on http://${address.host}:${address.port}`);
}

const isMain =
  process.argv[1] !== undefined &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  void main().catch((error) => {
    console.error('Failed to start Nautilus signer', error);
    process.exitCode = 1;
  });
}
