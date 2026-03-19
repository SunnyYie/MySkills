import { mkdir, open, readFile, readdir, rename, rm, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { CheckpointRecordSchema } from '../domain/index.js';

import {
  DIRECTORY_PERMISSIONS,
  FILE_PERMISSIONS,
  type RunPaths,
} from './layout.js';

export class RunLockConflictError extends Error {
  constructor(lockFilePath: string) {
    super(`Run is already locked: ${lockFilePath}`);
    this.name = 'RunLockConflictError';
  }
}

export type RunLockHandle = {
  lockFilePath: string;
  lockContents: {
    owner: string;
    pid: number;
    acquired_at: string;
  };
};

const ensureDirectory = async (directoryPath: string) => {
  await mkdir(directoryPath, { recursive: true, mode: DIRECTORY_PERMISSIONS });
  await chmodIfNeeded(directoryPath, DIRECTORY_PERMISSIONS);
};

const chmodIfNeeded = async (targetPath: string, expectedMode: number) => {
  const targetStat = await stat(targetPath);
  const currentMode = targetStat.mode & 0o777;

  if (currentMode !== expectedMode) {
    const { chmod } = await import('node:fs/promises');
    await chmod(targetPath, expectedMode);
  }
};

export const ensureRunDirectories = async (runPaths: RunPaths) => {
  await ensureDirectory(runPaths.runDir);
  await ensureDirectory(runPaths.checkpointsDir);
  await ensureDirectory(runPaths.artifactsDir);
};

export const writeFileAtomically = async (
  targetPath: string,
  contents: string,
  mode = FILE_PERMISSIONS,
) => {
  await ensureDirectory(path.dirname(targetPath));

  const tempPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
  const fileHandle = await open(tempPath, 'wx', mode);

  try {
    await fileHandle.writeFile(contents, 'utf8');
    await fileHandle.sync();
  } catch (error) {
    await fileHandle.close();
    await rm(tempPath, { force: true });
    throw error;
  }

  await fileHandle.close();
  await rename(tempPath, targetPath);
  await chmodIfNeeded(targetPath, mode);
};

export const writeJsonAtomically = async (
  targetPath: string,
  payload: unknown,
  mode = FILE_PERMISSIONS,
) => writeFileAtomically(targetPath, `${JSON.stringify(payload, null, 2)}\n`, mode);

export const acquireRunLock = async (
  lockFilePath: string,
  lockContents: RunLockHandle['lockContents'],
): Promise<RunLockHandle> => {
  await ensureDirectory(path.dirname(lockFilePath));

  try {
    const fileHandle = await open(lockFilePath, 'wx', FILE_PERMISSIONS);
    await fileHandle.writeFile(`${JSON.stringify(lockContents, null, 2)}\n`, 'utf8');
    await fileHandle.sync();
    await fileHandle.close();
    await chmodIfNeeded(lockFilePath, FILE_PERMISSIONS);
    return {
      lockFilePath,
      lockContents,
    };
  } catch (error) {
    if (isAlreadyExistsError(error)) {
      throw new RunLockConflictError(lockFilePath);
    }

    throw error;
  }
};

export const releaseRunLock = async (lockHandle: RunLockHandle) => {
  await unlink(lockHandle.lockFilePath);
};

export const readCheckpointRecords = async (checkpointsDir: string) => {
  await ensureDirectory(checkpointsDir);

  const entries = await readdir(checkpointsDir);
  const checkpointFiles = entries
    .filter((entry) => entry.endsWith('.json'))
    .sort((left, right) => left.localeCompare(right));

  const checkpoints = await Promise.all(
    checkpointFiles.map(async (checkpointFile) => {
      const checkpointPath = path.join(checkpointsDir, checkpointFile);
      const contents = await readFile(checkpointPath, 'utf8');
      return CheckpointRecordSchema.parse(JSON.parse(contents));
    }),
  );

  return checkpoints.sort((left, right) => left.sequence - right.sequence);
};

const isAlreadyExistsError = (error: unknown): error is NodeJS.ErrnoException =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  error.code === 'EEXIST';
