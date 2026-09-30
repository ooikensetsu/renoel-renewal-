import { siteImage, type SiteImageName } from "@/config/siteImages";

/**
 * 公開ページの固定画像を1枚描く。
 *
 * 画像が未設定（config/siteImages.ts が null）のときは <img> を出さず、
 * 同じ大きさの無地の枠を描く。壊れた画像アイコンを利用者に見せないため。
 * 装飾目的の枠に文字は入れない（alt が空の飾り画像のとき）。
 */
export default function SiteImage({
  name,
  alt,
  className,
}: {
  name: SiteImageName;
  alt: string;
  className?: string;
}) {
  const src = siteImage(name);

  if (!src) {
    return (
      <div
        className={`siteImage--empty${className ? ` ${className}` : ""}`}
        role={alt ? "img" : undefined}
        aria-label={alt || undefined}
        aria-hidden={alt ? undefined : true}
      />
    );
  }

  // 固定画像は数が少なく、寸法もCSS側で決まっているため next/image は使わない。
  // eslint-disable-next-line @next/next/no-img-element -- 自サイト配信の固定画像
  return <img src={src} alt={alt} className={className} loading="lazy" />;
}
