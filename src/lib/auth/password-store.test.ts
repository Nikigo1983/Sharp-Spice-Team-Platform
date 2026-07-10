import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  generateTemporaryPassword,
  validateNewPassword,
} from "./password-store";

describe("validateNewPassword", () => {
  it("rejects empty and short passwords", () => {
    assert.equal(validateNewPassword(""), "Введите пароль.");
    assert.equal(validateNewPassword("123"), "Пароль должен быть не короче 8 символов.");
  });

  it("accepts valid passwords", () => {
    assert.equal(validateNewPassword("secure-pass"), null);
  });
});

describe("generateTemporaryPassword", () => {
  it("creates passwords with requested length", () => {
    const password = generateTemporaryPassword(14);
    assert.equal(password.length, 14);
  });
});
