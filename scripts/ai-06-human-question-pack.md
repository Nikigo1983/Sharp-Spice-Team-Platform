# Sharp & Spice AI Workspace — Human Acceptance Question Pack

Reusable operator checklist (~30 questions).  
Do **not** hardcode into production routing rules.  
Use after model/retrieval changes. Fake/safe data only when validating locally.

## Knowledge Base
1. Какие документы нужны для ВНЖ в Хорватии?
2. Какой минимальный доход для digital nomad?
3. На какой срок выдаётся разрешение?
4. Можно ли подаваться с семьёй?
5. Что такое digital nomad в контексте наших программ?
6. What income threshold is listed for the program?
7. List the usual required documents for temporary stay.

## Clients
8. Какой статус у Иванова?
9. Какой адрес букинга у клиента?
10. Какой номер паспорта у клиента Белоус?
11. Покажи клиентов из Хорватии.
12. Кто менеджер у этого клиента?
13. Show clients by referent.

## Emigrant Drive
14. Какие документы загрузил Иван Петров?
15. Есть ли страховка в папке клиента?
16. Открой PDF трудовой договор у Марии.
17. Which files did the client upload to the case folder?

## Multi-source
18. Каких документов не хватает Ивану Петрову для ВНЖ в Хорватии?
19. Сравни загруженные документы с чеклистом программы.
20. Напиши письмо и укажи, какие документы уже есть / что неизвестно.
21. What is known present vs not found in retrieved context for this case?

## Insufficient / uncertainty
22. Какой минимальный доход? (когда в KB нет цифры)
23. Есть ли апостиль диплома? (если файл не извлечён)
24. What exact income is listed? (empty/catalog-only KB)

## Conflicts
25. Какой минимальный доход, если в KB два разных числа?
26. Which income figure is correct when sources disagree?

## Generation
27. Напиши вежливое письмо клиенту с напоминанием.
28. Переведи этот текст на английский: «Пожалуйста, пришлите документы».
29. Сделай текст более профессиональным.

## Ambiguous natural language
30. Подскажи, что обычно просят для residence permit.
31. А если человек фрилансер — какие условия обычно?
32. Сопоставь пакет клиента с требованиями программы без догадок.

## Operator notes
- Check: routing source chips match retrieved evidence.
- Check: NOT_FOUND ≠ “document missing”.
- Check: conflicts are disclosed, not silently resolved.
- Check: rewrite/translate still works without forced KB refusal.
