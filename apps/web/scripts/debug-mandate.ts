import 'dotenv/config';
import { getAgentSuiClient } from '../lib/agent/sui-client';

async function main() {
  const id = process.argv[2];
  if (!id) {
    console.error('usage: tsx scripts/debug-mandate.ts <mandate-object-id>');
    process.exit(1);
  }
  const client = getAgentSuiClient();
  const obj = await client.getObject({ id, options: { showContent: true } });
  const data = obj.data as { content?: { dataType?: unknown; fields?: Record<string, unknown> } } | null;
  const content = data?.content;
  console.log('keys on obj.data:', Object.keys(obj.data ?? {}));
  console.log('keys on content:', Object.keys(content ?? {}));
  console.log('content.dataType:', content?.dataType);
  const fields = content?.fields ?? {};
  console.log('field keys:', Object.keys(fields));
  console.log('witness_commit type:', typeof fields.witness_commit, Array.isArray(fields.witness_commit) ? `array[${fields.witness_commit.length}]` : '');
  console.log('witness_commit value:', fields.witness_commit);
  console.log('nonce:', fields.nonce, typeof fields.nonce);
}

main().catch(console.error);
