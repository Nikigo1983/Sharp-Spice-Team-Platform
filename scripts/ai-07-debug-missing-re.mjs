import { readFileSync } from "fs";
const rows = JSON.parse(readFileSync("scripts/ai-07-results/targeted-grounding.json", "utf8"));
const re =
  /(^|[^\p{L}])(отсутствует|отсутствуют|не\s+хватает|missing|does\s+not\s+have)(?!\p{L})/iu;
for (const row of rows) {
  const answer = row.answer || "";
  console.log(row.id, "missingVerb", re.test(answer), "match", answer.match(re));
  console.log(
    "ne tokens",
    [...answer.matchAll(/не\s+\S{1,25}/giu)].map((m) => m[0]),
  );
  console.log("includes missing?", /missing/i.test(answer));
  console.log("---");
}
