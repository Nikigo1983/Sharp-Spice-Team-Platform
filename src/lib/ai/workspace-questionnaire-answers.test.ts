import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildQuestionnaireAnswerPromptAddon,
  isQuestionnaireAnswerIntent,
} from "@/lib/ai/workspace-questionnaire-answers";

const SAMPLE = `Составь ответы на вопросы для Мазурина.
UAE первый раз было открыто резиденство 25.01.2023
Croatia Visa - не было в итоге визы.
Please answer each of the following questions in the form of a statement. Retain the text of the question immediately before your answer.
1.Please explain why you chose Croatia as your place of residence and employment.
2.Please state how you became aware of the possibility of obtaining a temporary residence permit for the purpose of digital nomad status.
3.Have you previously held a temporary residence permit in any other country and, if so, which country or countries?
6.Which countries have you visited, and during which periods (month/year)?
Please indicate the place and date of signing, and sign the document.`;

describe("workspace questionnaire answers", () => {
  it("detects official Q&A drafting intent", () => {
    assert.equal(isQuestionnaireAnswerIntent(SAMPLE), true);
    assert.equal(
      isQuestionnaireAnswerIntent("Какой паспорт у Иванова?"),
      false,
    );
    assert.equal(
      isQuestionnaireAnswerIntent("Собери данные для заполнения заявления"),
      false,
    );
  });

  it("builds prompt addon with required output rules", () => {
    const addon = buildQuestionnaireAnswerPromptAddon(SAMPLE);
    assert.match(addon, /ОФИЦИАЛЬНЫЕ ОТВЕТЫ/);
    assert.match(addon, /Signature/);
    assert.match(addon, /не выдумывай|Не выдумывай/i);
    assert.match(addon, /Place:/);
  });
});
