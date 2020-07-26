import {execFile, spawn} from 'child_process';

export const cmd = async (command: string, ...args: (string | number)[]): Promise<string> =>
  new Promise((resolve, reject) =>
    execFile(command, args.map(String), (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else if (stderr) {
        reject(new Error(`stderr: ${stderr}`));
      } else {
        resolve(stdout);
      }
    }));

export const job = async (command: string, errorOnBadStatus?: boolean, ...args: (string | number)[]): Promise<void> =>
  new Promise((resolve, reject) => {
    const proc = spawn(command, args.map(String), {stdio: ['ignore', 'inherit', 'inherit']});
    proc.on('error', console.error);
    proc.on('exit', (code, sig) => {
      if (code !== 0 && errorOnBadStatus) {
        reject(new Error(`Command exited with ${code ? `status ${code}` : `signal ${sig}`}: ${command} ${args.join(' ')}`));
      } else {
        resolve();
      }
    });
  });
