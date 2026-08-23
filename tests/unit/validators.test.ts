/**
 * TC-VAL-01  LoginSchema rejects bad email / empty password
 * TC-VAL-02  RegisterSchema enforces 8-char minimum + matching confirmation
 * TC-VAL-03  CreateProjectSchema key format (2-10 uppercase A-Z0-9)
 * TC-VAL-04  CreateWorkItemSchema defaults type=TASK priority=MEDIUM
 * TC-VAL-05  storyPoints coerces numeric strings, rejects negatives
 */
import { describe, expect, it } from "vitest";
import {
  LoginSchema,
  RegisterSchema,
  CreateProjectSchema,
  CreateWorkItemSchema,
} from "@/lib/validators";

describe("zod validators", () => {
  it("TC-VAL-01: login schema", () => {
    const ok = LoginSchema.safeParse({ email: "a@b.com", password: "x" });
    expect(ok.success).toBe(true);
    expect(LoginSchema.safeParse({ email: "not-an-email", password: "x" }).success).toBe(false);
    expect(LoginSchema.safeParse({ email: "a@b.com", password: "" }).success).toBe(false);
  });

  it("TC-VAL-02: register schema password rules", () => {
    expect(
      RegisterSchema.safeParse({
        email: "a@b.com",
        displayName: "A",
        password: "longenough1",
        confirmPassword: "longenough1",
      }).success
    ).toBe(true);
    // short password
    expect(
      RegisterSchema.safeParse({
        email: "a@b.com",
        displayName: "A",
        password: "short",
        confirmPassword: "short",
      }).success
    ).toBe(false);
    // mismatched confirmation
    const mismatch = RegisterSchema.safeParse({
      email: "a@b.com",
      displayName: "A",
      password: "longenough1",
      confirmPassword: "different12",
    });
    expect(mismatch.success).toBe(false);
    if (!mismatch.success) {
      expect(mismatch.error.issues[0].path[0]).toBe("confirmPassword");
    }
  });

  it("TC-VAL-03: project key format", () => {
    expect(
      CreateProjectSchema.safeParse({ key: "OPS", name: "Ops" }).success
    ).toBe(true);
    expect(
      CreateProjectSchema.safeParse({ key: "ops", name: "Ops" }).success
    ).toBe(false); // lowercase rejected
    expect(
      CreateProjectSchema.safeParse({ key: "TOOLONGKEY1", name: "Ops" }).success
    ).toBe(false);
    expect(
      CreateProjectSchema.safeParse({ key: "O", name: "Ops" }).success
    ).toBe(false); // too short
  });

  it("TC-VAL-04: work item defaults", () => {
    const r = CreateWorkItemSchema.parse({ title: "Do the thing" });
    expect(r.type).toBe("TASK");
    expect(r.priority).toBe("MEDIUM");
  });

  it("TC-VAL-05: story points coercion", () => {
    const ok = CreateWorkItemSchema.safeParse({ title: "t", storyPoints: "5" });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.storyPoints).toBe(5);
    expect(
      CreateWorkItemSchema.safeParse({ title: "t", storyPoints: -3 }).success
    ).toBe(false);
  });
});
