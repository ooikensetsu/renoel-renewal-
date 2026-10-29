/**
 * CSVの読み取り。物件の一括取込で使う。
 *
 * 【なぜ自前で書くか】
 * 以前は `text.split(",")` で切っていたため、値にカンマが1つでも入ると以降の列が全てずれた。
 * 「3LDK（和 8･6　洋 12）」のような表記や、住所の補足にカンマが入ると起きる。
 * 件数の確認では気付けず、間違った値がそのまま入る（S-08 の入力検証以前の問題）。
 * S-05 を避けるため外部パーサは足さず、RFC 4180 の必要な範囲だけを自前で実装する。
 */

/** 引用符に対応した1行の分解。`"a,b",c` → ["a,b", "c"]。 */
export function splitCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (inQuotes) {
      if (ch === '"') {
        // "" は引用符そのもの（RFC 4180）
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      values.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  values.push(current);
  return values.map((v) => v.trim());
}

/**
 * 本文を1件ずつのレコードに分ける。引用符の中の改行はレコードの区切りにしない
 * （「維持費等」は管理画面で複数行を入力できるため、書き出したCSVに改行が入る）。
 * 改行は CRLF / LF の両方を受け、引用符の中の CRLF は LF にそろえる。
 */
export function splitCsvRecords(body: string): string[] {
  const records: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === '"') inQuotes = !inQuotes; // "" は2回反転するので状態は変わらない
    if (ch === "\r" && body[i + 1] === "\n") continue;
    if ((ch === "\n" || ch === "\r") && !inQuotes) {
      records.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  records.push(current);
  return records;
}

/**
 * CSV本文をヘッダー付きの連想配列に変換する。
 * 空行は読み飛ばす。
 */
export function parseCsv(text: string): Record<string, string>[] {
  // BOM を除く。Excel が付けることがある。
  const body = text.replace(/^\uFEFF/, "");
  const lines = splitCsvRecords(body).filter((line) => line.trim() !== "");
  if (lines.length === 0) return [];

  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((header, i) => {
      row[header] = values[i] ?? "";
    });
    return row;
  });
}

/**
 * 文字コードを判定してテキストにする。
 *
 * Excel の「CSV形式で保存」は既定で Shift-JIS（cp932）のため、UTF-8 として読むと
 * 日本語の物件名・住所が全て文字化けする。実際に運用で踏みやすい。
 * まず UTF-8 として厳密に読み、失敗したら Shift-JIS として読み直す。
 */
export function decodeCsvBuffer(buffer: ArrayBuffer): {
  text: string;
  encoding: "UTF-8" | "Shift_JIS";
} {
  try {
    // fatal: true にすると、UTF-8 として不正なバイト列で例外になる
    const text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    return { text, encoding: "UTF-8" };
  } catch {
    const text = new TextDecoder("shift_jis").decode(buffer);
    return { text, encoding: "Shift_JIS" };
  }
}

/**
 * 1つの値を、CSVの列として安全な形にする。
 *
 * 【なぜ必要か】
 * 書き出し側は `values.join(",")` で連結していた。読み取り側（splitCsvLine）は
 * RFC 4180 に沿って引用符を解釈するのに、書き出し側だけ素通しだった。
 * 物件名「3LDK（和 8･6　洋 12）」や住所の補足にカンマが1つ入るだけで列がずれ、
 * 書き出し → 取り込みの往復でデータが壊れる。
 *
 * 【数式の無効化】
 * = + - @ で始まる値は、Excel / Google スプレッドシートが数式として実行する。
 * 物件名や住所は athome の取込データと管理画面の入力から来るため、
 * 開いた人の環境で意図しない計算・外部参照が走らないよう先頭に ' を付ける。
 */
export function toCsvValue(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);

  // 数式として解釈される先頭文字を無効化する（CSVインジェクション対策）
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;

  // 引用符・カンマ・改行を含むなら囲む。中の " は "" にする（RFC 4180）
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/**
 * ヘッダー行＋データ行を CSV 本文にする。
 * 改行は CRLF（RFC 4180。Excel が確実に行として扱う）。
 */
export function buildCsv(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map((row) => row.map(toCsvValue).join(",")).join("\r\n");
}
