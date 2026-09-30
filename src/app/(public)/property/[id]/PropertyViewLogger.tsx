"use client";

import { useEffect } from "react";
import { logPropertyView } from "@/app/actions/logActivity";

/**
 * 物件の閲覧履歴を記録するだけのコンポーネント。表示は何も行わない。
 * ページ本体をサーバーコンポーネントに保つために切り出している（C-03）。
 * 記録の可否（ログイン済みか）はサーバー側の logPropertyView が判定する。
 * 物件名も同じくサーバー側でDBから引く（画面から渡さない。S-08）。
 */
export default function PropertyViewLogger({ propertyId }: { propertyId: number }) {
  useEffect(() => {
    logPropertyView(propertyId);
  }, [propertyId]);

  return null;
}
