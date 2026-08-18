'use client';

import { useState } from 'react';
import rawEventData from '../data/events.json';

// JSON에서 실제 공구 단품 목록 추출
const ALL_PRODUCTS = rawEventData.events.flatMap((event) =>
  event.products.map((prod) => ({
    event_id: event.event_id,
    event_name: event.event_name,
    curator: event.curator.nickname,
    product_id: prod.product_id,
    name: prod.name,
    option: prod.option1 || '기본 옵션',
    consumer_price: prod.consumer_price,
    sale_price: prod.base_sale_price,
    discount_rate: prod.discount_rate_derived ? `${prod.discount_rate_derived}%` : '특가',
    image_url: prod.image_url,
    usp: prod.usp || '공동구매 최저가 혜택 및 안심 구성',
    selling_point: prod.selling_point || '우리 아이를 위한 믿을 수 있는 필수 육아 아이템!',
  }))
);

export default function Home() {
  const [step, setStep] = useState<'SELECT' | 'SCRIPT' | 'GENERATING' | 'COMPLETED'>('SELECT');
  const [selectedProduct, setSelectedProduct] = useState(ALL_PRODUCTS[0]);
  const [generatedScript, setGeneratedScript] = useState<{ hook: string; body: string; cta: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  // 1단계: 상품 데이터를 기반으로 Hook/Body/CTA 대본 생성 (로컬 안전 모드 - 비용 0원)
  const handleGenerateScript = () => {
    setLoading(true);
    setStatusText('상품 메타데이터를 분석하여 최적의 릴스 대본을 구성하는 중입니다...');

    setTimeout(() => {
      // JSON의 실제 USP 및 소구점 기반 대본 자동 구성
      setGeneratedScript({
        hook: `🚨 육아맘 주목! ${selectedProduct.name} 드디어 공구 오픈!`,
        body: `✨ ${selectedProduct.selling_point} (${selectedProduct.usp}) 정가 대비 ${selectedProduct.discount_rate} 할인 특가!`,
        cta: `댓글에 [${selectedProduct.option.split(' ')[0]}] 남겨주시면 최저가 구매 링크를 DM으로 바로 보내드려요!`
      });
      setLoading(false);
      setStep('SCRIPT');
    }, 600); // 자연스러운 0.6초 로딩 후 전환
  };

  // 2단계: S3 Presigned URL 기반 릴스 영상 생성 호출 (하영님 구현 모듈 연동)
  const handleGenerateVideo = async () => {
    setStep('GENERATING');
    setStatusText('백엔드 스토리지 파이프라인에서 S3 Presigned URL을 발급하고 있습니다...');
    setVideoUrl(null);

    try {
      // 백엔드 app/api/v1/reels/generate 엔드포인트 호출
      const response = await fetch('http://localhost:8000/api/v1/reels/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: selectedProduct.product_id,
          name: selectedProduct.name,
          option: selectedProduct.option,
        }),
      });

      if (!response.ok) {
        throw new Error(`서버 응답 에러 (${response.status})`);
      }

      const data = await response.json();

      if (data.video_url) {
        setVideoUrl(data.video_url);
        setStep('COMPLETED');
      } else {
        throw new Error('video_url을 전달받지 못했습니다.');
      }
    } catch (error: any) {
      console.error(error);
      alert(`영상 생성 실패: ${error.message}\n(백엔드 서버 구동 여부를 확인해주세요)`);
      setStep('SCRIPT');
    }
  };

  return (
    <main style={{ maxWidth: '720px', margin: '40px auto', padding: '24px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      
      {/* 상단 타이틀 */}
      <div style={{ borderBottom: '2px solid #111', paddingBottom: '16px', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 800 }}>AI 릴스 영상 생성기 (MVP)</h2>
          <p style={{ margin: '6px 0 0 0', color: '#666', fontSize: '14px' }}>
            공동구매 상품 선택 $\rightarrow$ 스크립트 도출 $\rightarrow$ S3 스트리밍 파이프라인
          </p>
        </div>
        <span style={{ fontSize: '12px', background: '#e0f2fe', color: '#0369a1', padding: '4px 8px', borderRadius: '6px', fontWeight: 'bold' }}>
          {step}
        </span>
      </div>

      {/* Step 1: 공동구매 상품 1건 선택 */}
      {step === 'SELECT' && (
        <div>
          <label style={{ display: 'block', fontWeight: 'bold', fontSize: '15px', marginBottom: '12px' }}>
            광고할 공동구매 단품 선택
          </label>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '420px', overflowY: 'auto', paddingRight: '8px', marginBottom: '24px' }}>
            {ALL_PRODUCTS.map((prod) => {
              const isSelected = selectedProduct.product_id === prod.product_id;
              return (
                <div
                  key={prod.product_id}
                  onClick={() => setSelectedProduct(prod)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '12px 16px',
                    borderRadius: '10px',
                    border: isSelected ? '2px solid #0070f3' : '1px solid #e2e8f0',
                    backgroundColor: isSelected ? '#f0f7ff' : '#fff',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ width: '56px', height: '56px', borderRadius: '8px', overflow: 'hidden', backgroundColor: '#f1f5f9', marginRight: '14px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {prod.image_url ? (
                      <img src={prod.image_url} alt={prod.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <span style={{ fontSize: '20px' }}>📦</span>
                    )}
                  </div>

                  <div style={{ flexGrow: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                      <span style={{ fontSize: '11px', background: '#e2e8f0', color: '#475569', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                        {prod.curator}
                      </span>
                      <span style={{ fontSize: '11px', color: '#64748b' }}>{prod.event_name}</span>
                    </div>

                    <strong style={{ fontSize: '14px', color: '#0f172a', display: 'block' }}>
                      {prod.name} - {prod.option}
                    </strong>

                    <div style={{ fontSize: '13px', color: '#0070f3', fontWeight: 'bold', marginTop: '2px' }}>
                      {prod.sale_price ? `${prod.sale_price.toLocaleString()}원` : ''}{' '}
                      <span style={{ fontSize: '12px', color: '#dc2626', fontWeight: 'normal' }}>
                        ({prod.discount_rate} 할인)
                      </span>
                    </div>
                  </div>

                  <input
                    type="radio"
                    checked={isSelected}
                    onChange={() => setSelectedProduct(prod)}
                    style={{ width: '18px', height: '18px', cursor: 'pointer', marginLeft: '12px' }}
                  />
                </div>
              );
            })}
          </div>

          <button
            onClick={handleGenerateScript}
            disabled={loading}
            style={{ width: '100%', padding: '16px', fontSize: '16px', fontWeight: 700, backgroundColor: loading ? '#94a3b8' : '#0070f3', color: '#fff', border: 'none', borderRadius: '8px', cursor: loading ? 'not-allowed' : 'pointer' }}
          >
            {loading ? statusText : `선택한 [${selectedProduct.name} - ${selectedProduct.option}] 스크립트 도출`}
          </button>
        </div>
      )}

      {/* Step 2: Hook / Body / CTA 스크립트 확인 */}
      {step === 'SCRIPT' && generatedScript && (
        <div>
          <button onClick={() => setStep('SELECT')} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', marginBottom: '12px', padding: 0 }}>
            ← 상품 다시 선택하기
          </button>
          
          <h3 style={{ fontSize: '18px', marginBottom: '4px' }}>도출된 3구간 스크립트 프리뷰</h3>
          <p style={{ color: '#666', fontSize: '13px', marginBottom: '20px' }}>선택 상품: <strong>{selectedProduct.name} ({selectedProduct.option})</strong></p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
            <div style={{ padding: '14px', border: '1px solid #fee2e2', borderRadius: '8px', backgroundColor: '#fef2f2' }}>
              <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#dc2626', display: 'block', marginBottom: '4px' }}>1. Hook (0~3초 관심 유도)</span>
              <p style={{ margin: 0, fontSize: '14px', color: '#1e293b' }}>{generatedScript.hook}</p>
            </div>

            <div style={{ padding: '14px', border: '1px solid #dbeafe', borderRadius: '8px', backgroundColor: '#eff6ff' }}>
              <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#2563eb', display: 'block', marginBottom: '4px' }}>2. Body (3~12초 소구점 전달)</span>
              <p style={{ margin: 0, fontSize: '14px', color: '#1e293b' }}>{generatedScript.body}</p>
            </div>

            <div style={{ padding: '14px', border: '1px solid #dcfce7', borderRadius: '8px', backgroundColor: '#f0fdf4' }}>
              <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#16a34a', display: 'block', marginBottom: '4px' }}>3. CTA (12~15초 행동 유도)</span>
              <p style={{ margin: 0, fontSize: '14px', color: '#1e293b' }}>{generatedScript.cta}</p>
            </div>
          </div>

          <button
            onClick={handleGenerateVideo}
            style={{ width: '100%', padding: '16px', fontSize: '16px', fontWeight: 700, backgroundColor: '#0f172a', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
          >
            이 스크립트로 릴스 영상 생성 및 S3 발급
          </button>
        </div>
      )}

      {/* Step 3: 영상 생성/발급 진행 중 */}
      {step === 'GENERATING' && (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <div style={{ fontSize: '32px', marginBottom: '16px' }}>⚙️</div>
          <h3 style={{ fontSize: '18px', marginBottom: '8px' }}>S3 파이프라인과 통신 중입니다</h3>
          <p style={{ color: '#666', fontSize: '14px' }}>{statusText}</p>
        </div>
      )}

      {/* Step 4: 영상 생성 완료 & S3 재생 */}
      {step === 'COMPLETED' && videoUrl && (
        <div>
          <h3 style={{ fontSize: '18px', marginBottom: '8px' }}>🎉 릴스 영상 생성 완료!</h3>
          <p style={{ color: '#666', fontSize: '13px', marginBottom: '20px' }}>AWS S3 Presigned URL을 통해 안전하게 스트리밍됩니다.</p>

          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
            <video
              src={videoUrl}
              controls
              autoPlay
              style={{ width: '280px', height: '497px', borderRadius: '12px', backgroundColor: '#000', boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}
            />
          </div>

          <button
            onClick={() => setStep('SELECT')}
            style={{ width: '100%', padding: '12px', fontSize: '15px', backgroundColor: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
          >
            다른 상품으로 새 영상 만들기
          </button>
        </div>
      )}
    </main>
  );
}