import net from 'node:net';
import { describe, expect, it } from 'vitest';
import { portFree } from './port';

describe('portFree', () => {
  it('is false while something listens on the port, and true once it stops', async () => {
    const holder = net.createServer();
    await new Promise<void>((r) => holder.listen(0, '127.0.0.1', r));
    const { port } = holder.address() as net.AddressInfo;
    expect(await portFree(port)).toBe(false);
    await new Promise((r) => holder.close(r));
    expect(await portFree(port)).toBe(true);
  });
});
