import type { SpawnOptionsWithoutStdio } from 'node:child_process';
import type { SpawnSyncReturns } from 'node:child_process';
import { spawn } from 'node:child_process';
import ansis from 'ansis';

export async function runCommand(
  command: string,
  args: string[],
  options?: SpawnOptionsWithoutStdio,
  ignoreExitStatus = false
): Promise<string> {
  console.info(ansis.green(`$ ${command} ${args}`));
  console.info('stdout: ---------------------');
  const ret = await spawnAsync(command, args, options);
  const stderr = ret.stderr.trim();
  if (stderr) {
    console.info('stderr: ---------------------');
    console.info(ansis.yellow(stderr));
  }
  console.info('-----------------------------');
  console.info(ansis.magenta(`Exit code: ${ret.status}\n`));
  if (!ignoreExitStatus && ret.status !== 0 && ret.status !== null) {
    process.exit(ret.status);
  }
  return ret.stdout;
}

export async function spawnAsync(
  command: string,
  args?: ReadonlyArray<string>,
  options?: SpawnOptionsWithoutStdio
): Promise<Omit<SpawnSyncReturns<string>, 'output' | 'error'>> {
  return new Promise((resolve, reject) => {
    try {
      const proc = spawn(command, args ?? [], options);
      // `setEncoding` is undefined in Bun
      proc.stdout?.setEncoding?.('utf8');
      proc.stderr?.setEncoding?.('utf8');

      let stdout = '';
      let stderr = '';
      proc.stdout?.on('data', (data) => {
        process.stdout.write(data);
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
