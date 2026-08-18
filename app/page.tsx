'use client';

import { useState } from 'react';
import rawEventData from '../data/events.json';

// JSON에서 실제 공구 단품 목록을 추출하여 화면용 데이터로 변환
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
    usp: prod.usp,
    selling_point: prod.selling_point,
  }))
);

export default function Home() {
  const [selectedProduct, setSelectedProduct] = useState(ALL_PRODUCTS[0]);
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  // 영상 생성 요청 핸들러
  const handleGenerate = async () => {
    setLoading(true);
    setVideoUrl(null);
    setStatusText('백엔드 서버로 생성 요청을 전달하고 있습니다...');

    try {
      // 로컬 테스트: http://localhost:8000, 배포 서버 테스트: https://<도메인>
      const response = await fetch('http://localhost:8000/api/v1/reels/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: selectedProduct.product_id,
          name: selectedProduct.name,
          option: selectedProduct.option,
          sale_price: selectedProduct.sale_price,
          discount_rate: selectedProduct.discount_rate,
        }),
      });

      if (!response.ok) {
        throw new Error(`서버 응답 오류 (${response.status})`);
      }

      const data = await response.json();

      if (data.video_url) {
        setVideoUrl(data.video_url);
      } else if (data.job_id) {
        setStatusText('영상이 백그라운드에서 렌더링 중입니다. 완료를 기다립니다...');
      }
    } catch (error) {
      console.error(error);
      alert('백엔드 서버와 통신할 수 없습니다. (서버 실행 여부 및 CORS를 확인해주세요)');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ maxWidth: '720px', margin: '40px auto', padding: '24px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      
      {/* 1. 상단 헤더 */}
      <div style={{ borderBottom: '2px solid #111', paddingBottom: '16px', marginBottom: '24px' }}>
        <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 800 }}>AI 릴스 영상 생성기 (MVP)</h2>
        <p style={{ margin: '6px 0 0 0', color: '#666', fontSize: '14px' }}>
          실제 공동구매 상품을 선택하여 AI 숏폼 광고 영상을 생성합니다. (총 {ALL_PRODUCTS.length}개 상품)
        </p>
      </div>

      {/* 2. 공동구매 상품 목록 (스크롤 영역) */}
      <div style={{ marginBottom: '24px' }}>
        <label style={{ display: 'block', fontWeight: 'bold', fontSize: '15px', marginBottom: '12px' }}>
          광고할 공동구매 단품 선택
        </label>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '420px', overflowY: 'auto', paddingRight: '8px' }}>
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
                  transition: 'all 0.15s ease',
                }}
              >
                {/* 실제 상품 썸네일 이미지 */}
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
                    <span style={{ fontSize: '11px', color: '#64748b' }}>
                      {prod.event_name}
                    </span>
                  </div>

                  <strong style={{ fontSize: '14px', color: '#0f172a', display: 'block' }}>
                    {prod.name} - {prod.option}
                  </strong>

                  <div style={{ fontSize: '13px', color: '#0070f3', fontWeight: 'bold', marginTop: '2px' }}>
                    {prod.sale_price ? `${prod.sale_price.toLocaleString()}원` : '가격 정보 없음'}{' '}
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
      </div>

      {/* 3. 생성 버튼 */}
      <button
        onClick={handleGenerate}
        disabled={loading}
        style={{
          width: '100%',
          padding: '16px',
          fontSize: '16px',
          fontWeight: 700,
          backgroundColor: loading ? '#94a3b8' : '#0f172a',
          color: '#fff',
          border: 'none',
          borderRadius: '8px',
          cursor: loading ? 'not-allowed' : 'pointer',
        }}
      >
        {loading ? 'AI 영상 제작 및 S3 업로드 중...' : `선택한 [${selectedProduct.name} - ${selectedProduct.option}] 생성`}
      </button>

      {/* 4. 결과 및 상태 표시 영역 */}
      <div style={{ marginTop: '28px', textAlign: 'center' }}>
        {loading && (
          <div style={{ padding: '30px 0' }}>
            <div style={{ fontSize: '28px', marginBottom: '10px' }}>⚙️</div>
            <p style={{ fontSize: '15px', color: '#334155', margin: 0 }}>{statusText}</p>
          </div>
        )}

        {videoUrl && !loading && (
          <div style={{ backgroundColor: '#f8fafc', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <h3 style={{ margin: '0 0 6px 0', fontSize: '17px', color: '#0f172a' }}>🎉 릴스 영상 생성 완료!</h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: '#64748b' }}>S3 Presigned URL 발급 및 스트리밍 성공</p>
            
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <video
                src={videoUrl}
                controls
                autoPlay
                style={{ width: '280px', height: '497px', borderRadius: '8px', backgroundColor: '#000', boxShadow: '0 4px 16px rgba(0,0,0,0.1)' }}
              />
            </div>
          </div>
        )}
      </div>
    </main>
  );
}