import { describe, expect, it } from "vitest";
import { ACCOUNT_SCOPES, missingScopes } from "./account-permissions";

describe("missingScopes", () => {
  it("chưa cấp gì: thiếu cả tên/ảnh lẫn SĐT", () => {
    expect(missingScopes({})).toEqual(["scope.userInfo", "scope.userPhonenumber"]);
    expect(missingScopes(undefined)).toEqual(ACCOUNT_SCOPES);
  });

  it("đã cấp tên/ảnh: chỉ thiếu SĐT", () => {
    expect(missingScopes({ "scope.userInfo": true })).toEqual(["scope.userPhonenumber"]);
  });

  it("cấp đủ: không thiếu gì", () => {
    expect(missingScopes({ "scope.userInfo": true, "scope.userPhonenumber": true })).toEqual([]);
  });

  it("khách từ chối (false) vẫn tính là thiếu", () => {
    expect(missingScopes({ "scope.userInfo": false, "scope.userPhonenumber": true })).toEqual(["scope.userInfo"]);
  });
});
