import bcrypt from 'bcryptjs';

const BCRYPT_ROUNDS = 12;

export function hashPassword(plain) {
  return bcrypt.hashSync(plain, BCRYPT_ROUNDS);
}

export function verifyPassword(plain, passwordHash) {
  return bcrypt.compareSync(plain, passwordHash);
}
