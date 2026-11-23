import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import {SubmittedAttempts} from './submittedAttempt';
import {createPurchaseAttemptStorage} from './purchaseAttemptJournal';

const storage = createPurchaseAttemptStorage({
  documentDirectory: FileSystem.documentDirectory,
  hash: value => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value),
  uuid: Crypto.randomUUID,
  makeDirectoryAsync: FileSystem.makeDirectoryAsync,
  readDirectoryAsync: FileSystem.readDirectoryAsync,
  readAsStringAsync: FileSystem.readAsStringAsync,
  writeAsStringAsync: FileSystem.writeAsStringAsync,
  getInfoAsync: FileSystem.getInfoAsync,
  copyAsync: FileSystem.copyAsync,
  moveAsync: FileSystem.moveAsync,
});
export const submittedAttempts = new SubmittedAttempts(storage);
