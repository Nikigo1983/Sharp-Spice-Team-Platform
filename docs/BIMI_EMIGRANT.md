# BIMI — логотип Emigrant в кружочке письма

Кружок рядом с именем отправителя настраивается **в DNS домена** (`sharpspise.com`), не в коде письма.

После деплоя логотип для BIMI доступен по адресу:

`https://sharp-spice-team-platform.vercel.app/bimi/emigrant-logo.svg`

(если `NEXT_PUBLIC_APP_URL` другой — подставьте свой origin)

---

## 1. Проверить DMARC

В DNS домена (Link-Host) должна быть TXT-запись `_dmarc`:

```txt
v=DMARC1; p=quarantine; pct=100; rua=mailto:ВАШ@EMAIL.com
```

или `p=reject`.  
Без `quarantine`/`reject` BIMI **не покажется**.

Проверка: https://mxtoolbox.com/dmarc.aspx

---

## 2. DNS-запись BIMI

Добавьте TXT:

| Host / Name              | Type | Value |
|--------------------------|------|--------|
| `default._bimi`          | TXT  | см. ниже |

**Yahoo (часто работает без сертификата):**

```txt
v=BIMI1; l=https://sharp-spice-team-platform.vercel.app/bimi/emigrant-logo.svg;
```

**Gmail / Apple (нужен сертификат VMC или CMC):**

1. Купите VMC (нужен товарный знак) или CMC (лого используется ≥1 года) у DigiCert / GlobalSign / SSL.com  
2. Получите `.pem` сертификат  
3. Запись:

```txt
v=BIMI1; l=https://sharp-spice-team-platform.vercel.app/bimi/emigrant-logo.svg; a=https://URL-ВАШЕГО-СЕРТИФИКАТА.pem;
```

Гайд Resend: https://resend.com/docs/dashboard/domains/bimi

---

## 3. После публикации DNS

- Подождите 24–72 часа  
- Отправьте новое письмо (сброс пароля / приглашение)  
- Проверка записи: https://bimigroup.org/bimi-generator/  
- Старые письма могут ещё показывать SS — смотрите **новое** письмо

---

## Важно

| Клиент   | Без сертификата | С CMC | С VMC |
|----------|-----------------|-------|-------|
| Yahoo    | часто да        | да    | да    |
| Gmail    | нет             | да    | да    |
| Apple    | нет             | нет   | да    |
| Outlook  | нет             | нет   | нет   |

Пока нет VMC/CMC, в Gmail кружок может остаться старым; в Yahoo после шагов 1–2 обычно появляется Emigrant.
