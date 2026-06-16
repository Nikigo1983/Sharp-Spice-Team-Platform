import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { validateLeadForCrmCreate } from "@/lib/leads/lead-create-validation";

const PREV_ADMIN = process.env.CRM_WRITE_ADMIN_EMAIL;
const PREV_PLATFORM = process.env.CRM_WRITE_PLATFORM_EMAILS;
const PREV_SERVICE = process.env.CRM_WRITE_SERVICE_EMAILS;

afterEach(() => {
  process.env.CRM_WRITE_ADMIN_EMAIL = PREV_ADMIN;
  process.env.CRM_WRITE_PLATFORM_EMAILS = PREV_PLATFORM;
  process.env.CRM_WRITE_SERVICE_EMAILS = PREV_SERVICE;
});

describe("validateLeadForCrmCreate test lead guard", () => {
  it("flags lead with test marker in name", () => {
    const errors = validateLeadForCrmCreate({
      name: "Иванов test Иванович",
      passport: "777063956",
      phone: "79874362823",
      email: "candidate@example.com",
    });
    assert.ok(errors.includes("test_lead_detected"));
  });

  it("flags lead with demo marker in name", () => {
    const errors = validateLeadForCrmCreate({
      name: "Петров Демо Петрович",
      passport: "760724050",
      phone: "79185548574",
      email: "candidate@example.com",
    });
    assert.ok(errors.includes("test_lead_detected"));
  });

  it("flags lead when email matches platform service list", () => {
    process.env.CRM_WRITE_PLATFORM_EMAILS = "team+service@sharp-spice.com";
    const errors = validateLeadForCrmCreate({
      name: "Сидоров Иван Иванович",
      passport: "39419221",
      phone: "79437658423",
      email: "team+service@sharp-spice.com",
    });
    assert.ok(errors.includes("test_lead_detected"));
  });

  it("flags lead when email matches admin email", () => {
    process.env.CRM_WRITE_ADMIN_EMAIL = "admin@sharp-spice.com";
    const errors = validateLeadForCrmCreate({
      name: "Смирнова Анна Ивановна",
      passport: "772808561",
      phone: "905556366676",
      email: "admin@sharp-spice.com",
    });
    assert.ok(errors.includes("test_lead_detected"));
  });

  it("keeps valid non-test lead clean", () => {
    const errors = validateLeadForCrmCreate({
      name: "Кулешова Леонелла Евгеньевна",
      passport: "776511478",
      phone: "79851657350",
      email: "leonella0123401@gmail.com",
    });
    assert.equal(errors.includes("test_lead_detected"), false);
  });
});
