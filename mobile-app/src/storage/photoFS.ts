import * as FileSystem from 'expo-file-system/legacy';

const ROOT = `${FileSystem.documentDirectory}pod-photos/`;

async function ensureDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(ROOT);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(ROOT, { intermediates: true });
  }
}

export async function savePhotoForStop(soNumber: string, sourceUri: string): Promise<string> {
  await ensureDir();
  const filename = `${soNumber}-${Date.now()}.jpg`;
  const destUri = ROOT + filename;
  await FileSystem.copyAsync({ from: sourceUri, to: destUri });
  return destUri;
}


export async function savePhotoForJobNote(sourceUri: string): Promise<string> {
  await ensureDir();
  const filename = `job-note-${Date.now()}.jpg`;
  const destUri = ROOT + filename;
  await FileSystem.copyAsync({ from: sourceUri, to: destUri });
  return destUri;
}

export async function deletePhoto(uri: string): Promise<void> {
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch (e) {
    console.warn('[photoFS] delete failed', e);
  }
}

export async function listSavedPhotos(soNumber: string): Promise<string[]> {
  await ensureDir();
  const all = await FileSystem.readDirectoryAsync(ROOT);
  return all
    .filter((name) => name.startsWith(`${soNumber}-`))
    .map((name) => ROOT + name)
    .sort();
}
