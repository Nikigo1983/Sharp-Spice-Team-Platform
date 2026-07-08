import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildMailtoShareUrl,
  buildTelegramShareUrl,
  buildWhatsAppShareUrl,
} from "./meeting-guest-invite-share";

const inviteText = [
  "Добрый день, Анна!",
  "",
  "Приглашаем вас на видеовстречу «Консультация».",
  "",
  "Подключиться можно по ссылке (регистрация не нужна):",
  "https://example.com/join/abc",
  "",
  "До встречи!",
].join("\n");

describe("meeting-guest-invite-share", () => {
  it("builds mailto with recipient and encoded body", () => {
    const url = buildMailtoShareUrl(inviteText, {
      subject: "Приглашение",
      recipientEmail: "anna@example.com",
    });

    assert.match(url, /^mailto:anna%40example\.com\?/);
    assert.match(url, /subject=%D0%9F%D1%80%D0%B8%D0%B3%D0%BB%D0%B0%D1%88%D0%B5%D0%BD%D0%B8%D0%B5/);
    assert.match(url, /body=/);
  });

  it("builds WhatsApp url without phone", () => {
    const url = buildWhatsAppShareUrl(inviteText);

    assert.equal(url, `https://wa.me/?text=${encodeURIComponent(inviteText)}`);
  });

  it("builds WhatsApp url with normalized phone", () => {
    const url = buildWhatsAppShareUrl(inviteText, "+7 (999) 123-45-67");

    assert.equal(
      url,
      `https://wa.me/79991234567?text=${encodeURIComponent(inviteText)}`,
    );
  });

  it("builds Telegram url without duplicating join link in text", () => {
    const joinUrl = "https://example.com/join/abc";
    const url = buildTelegramShareUrl(inviteText, joinUrl);

    assert.match(url, /^https:\/\/t\.me\/share\/url\?/);
    assert.match(url, new RegExp(`url=${encodeURIComponent(joinUrl)}`));
    assert.doesNotMatch(
      decodeURIComponent(url),
      /https:\/\/example\.com\/join\/abc[\s\S]*https:\/\/example\.com\/join\/abc/,
    );
  });
});
