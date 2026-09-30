"use client";

import { useState } from "react";
import Link from "next/link";
import SiteImage from "@/components/SiteImage";

const calculateMortgage = (principal: number, annualRate: number, years: number) => {
  const monthlyRate = annualRate / 12 / 100;
  const numberOfPayments = years * 12;
  if (monthlyRate === 0) return principal / numberOfPayments;
  
  return (
    (principal * monthlyRate * Math.pow(1 + monthlyRate, numberOfPayments)) /
    (Math.pow(1 + monthlyRate, numberOfPayments) - 1)
  );
};

export default function SimulationPage() {
  const [propertyPrice, setPropertyPrice] = useState(2500); // 万円
  const [reformPrice, setReformPrice] = useState(1000); // 万円
  const [downPayment, setDownPayment] = useState(0); // 万円
  const [interestRate, setInterestRate] = useState(0.75);
  const [loanYears, setLoanYears] = useState(35);

  const totalLoanAmount = (propertyPrice + reformPrice - downPayment) * 10000;
  const monthlyPayment = calculateMortgage(totalLoanAmount, interestRate, loanYears);

  return (
    <>
      <div className="pageHead">
        <div className="pageHead__bg">
          <SiteImage name="pageHero" alt="" />
        </div>
        <div className="container container--wide pageHead__inner">
          <span className="pageHead__en">SIMULATION</span>
          <h1 className="pageHead__ttl">資金シミュレーション</h1>
        </div>
      </div>

      <nav className="container container--wide breadcrumb" aria-label="パンくずリスト">
        <ol>
          <li><Link href="/">HOME</Link></li>
          <li aria-current="page">資金シミュレーション</li>
        </ol>
      </nav>

      <section className="sec">
        <div className="container container--wide">
          <div className="secTtl">
            <span className="en">SIMULATION</span>
            <span className="ja">月々のお支払い額を計算</span>
          </div>

          <div className="simWrap">
            {/* 入力フォーム */}
            <div className="simForm">
              <div className="simForm__row">
                <label>物件価格</label>
                <span className="val">{propertyPrice.toLocaleString()}万円</span>
                <input 
                  type="range" min="500" max="10000" step="100" 
                  value={propertyPrice} onChange={(e) => setPropertyPrice(Number(e.target.value))}
                />
              </div>

              <div className="simForm__row">
                <label>リフォーム費用</label>
                <span className="val">{reformPrice.toLocaleString()}万円</span>
                <input 
                  type="range" min="0" max="3000" step="50" 
                  value={reformPrice} onChange={(e) => setReformPrice(Number(e.target.value))}
                />
              </div>

              <div className="simForm__row">
                <label>頭金</label>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <input 
                    type="number" value={downPayment} onChange={(e) => setDownPayment(Number(e.target.value))}
                    style={{ width: "100px", textAlign: "right" }}
                  />
                  <span>万円</span>
                </div>
              </div>

              <div className="simForm__row">
                <label>借入期間</label>
                <div className="selectWrap">
                  <select 
                    value={loanYears} onChange={(e) => setLoanYears(Number(e.target.value))}
                  >
                    {[20, 25, 30, 35, 40].map(y => <option key={y} value={y}>{y}年</option>)}
                  </select>
                </div>
              </div>

              <div className="simForm__row">
                <label>想定金利</label>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <input 
                    type="number" step="0.01" value={interestRate} onChange={(e) => setInterestRate(Number(e.target.value))}
                    style={{ width: "100px", textAlign: "right" }}
                  />
                  <span>%</span>
                </div>
              </div>
            </div>

            {/* 結果表示 */}
            <div className="simResult">
              <div className="simResult__label">月々のお支払い目安</div>
              <div className="simResult__val">
                {Math.round(monthlyPayment).toLocaleString()}
                <span className="unit">円</span>
              </div>

              <div className="simResult__break">
                <div>
                  <span>物件価格</span>
                  <span>{propertyPrice.toLocaleString()}万円</span>
                </div>
                <div>
                  <span>リフォーム費用</span>
                  <span>+{reformPrice.toLocaleString()}万円</span>
                </div>
                <div>
                  <span>頭金</span>
                  <span>-{downPayment.toLocaleString()}万円</span>
                </div>
                <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px dotted rgba(255,255,255,0.4)" }}>
                  <span>お借入総額</span>
                  <span style={{ fontSize: "1.6rem", fontWeight: "bold" }}>
                    {(propertyPrice + reformPrice - downPayment).toLocaleString()}万円
                  </span>
                </div>
              </div>

              <p className="simResult__note" style={{ marginTop: "24px" }}>
                ※シミュレーション結果は概算です。<br />実際の借入条件や諸経費については別途お問い合わせください。
              </p>

              <div className="mt-8">
                <button className="btn btn--white btn--block">この資金計画で相談する</button>
              </div>
            </div>
          </div>

          <div className="alertNote" style={{ marginTop: "40px" }}>
            <strong>住宅ローン控除も対象です</strong>
            <p className="mt-2">
              中古住宅の購入＋リノベーションでも、一定の要件を満たせば住宅ローン控除が受けられます。税金や補助金に関するアドバイスも行っています。
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
