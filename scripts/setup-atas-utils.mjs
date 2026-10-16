import { TokenAccountNotFoundError } from '@solana/spl-token';

export function isMissingTokenAccount(error) {
  return error instanceof TokenAccountNotFoundError;
}
