import type { SpawnSyncReturns } from 'node:child_process';
import { spawn } from 'node:child_process';
import ansis from 'ansis';

const noop = (text: string) => text;

export async function runCommand(command: string, args: string[], addColor = true): Promise<string> {
  console.info(ansis.green(`$ ${command} ${args}`));
  const ret = await spawnAsync(command, args);
  console.info('stdout: ---------------------');
  console.info((addColor ? ansis.cyan : noop)(ret.stdout.trim()));
  console.info('stderr: ---------------------');
  console.info((addColor ? ansis.magenta : noop)(ret.stderr.trim()));
  console.info('-----------------------------');
  console.info(ansis.yellow(`Exit code: ${ret.status}`));
  console.info(' ');
  if (ret.status !== 0 && ret.status !== null) {
    process.exit(ret.status);
  }
  return ret.stdout;
}

export async function spawnAsync(
  command: string,
  args?: ReadonlyArray<string>
): Promise<Omit<SpawnSyncReturns<string>, 'output' | 'error'>> {
  return new Promise((resolve, reject) => {
    try {
      const proc = spawn(command, args ?? []);
      // `setEncoding` is undefined in Bun
      proc.stdout?.setEncoding?.('utf8');
      proc.stderr?.setEncoding?.('utf8');

      let stdout = '';
      let stderr = '';
      proc.stdout?.on('data', (data) => {
        stdout += data;
      });
      proc.stderr?.on('data', (data) => {
        stderr += data;
      });

      proc.on('error', (error) => {
        reject(error);
      });
      proc.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
        if (proc.pid === undefined) {
          reject(new Error('Process has no pid.'));
        } else {
          resolve({
            pid: proc.pid,
            stdout,
            stderr,
            status: code,
            signal,
          });
        }
      });
    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      reject(error);
    }
  });
}
