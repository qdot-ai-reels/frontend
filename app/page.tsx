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
    image_url: prod.image_url || 'https://ecimg.cafe24img.com/pg497b06764456086/weosk/web/product/small/20260721/cbb2045a9530e6a7a093b999f0ff5951.jpg',
    usp: prod.usp,
    selling_point: prod.selling_point,
    raw_product: prod // 백엔드 LLM 전달용 원본 JSON
  }))
);

export default function Home() {
  const [step, setStep] = useState<'SELECT' | 'SCRIPT' | 'GENERATING' | 'COMPLETED'>('SELECT');
  const [selectedProduct, setSelectedProduct] = useState(ALL_PRODUCTS[0]);
  const [generatedScriptDoc, setGeneratedScriptDoc] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  // 1단계: OpenRouter LLM 기반 실제 대본 생성 호출
  const handleGenerateScript = async () => {
    setLoading(true);
    setStatusText('OpenRouter AI가 상품 정보를 분석하여 규격 대본을 생성 중입니다...');

    try {
      const response = await fetch('http://localhost:8000/api/v1/reels/script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product: selectedProduct.raw_product, // 단품 JSON 전체 전달
          max_duration_seconds: 6, // 비디오 모델 지원 규격(4, 6, 8초 중 6초)
          channel: 'Instagram Reels',
          target_audience: '육아에 관심 있는 보호자',
          supported_video_durations: [4, 6, 8]
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || '대본 생성 실패');
      }

      const data = await response.json();
      // 백엔드 script_generator가 검증 완료한 script 문서 바인딩
      setGeneratedScriptDoc(data.script || data);
      setStep('SCRIPT');
    } catch (error: any) {
      console.error(error);
      alert(`대본 생성 오류: ${error.message}\n(백엔드 OPENROUTER_SCRIPT_API_KEY 설정을 확인해주세요)`);
    } finally {
      setLoading(false);
    }
  };

  // 2단계: 생성된 실제 대본으로 OpenRouter 영상 생성 호출
  const handleGenerateVideo = async () => {
    setStep('GENERATING');
    setStatusText('OpenRouter 비디오 모델이 영상을 렌더링하고 FFprobe 검증을 진행 중입니다 (약 30초~1분)...');
    setVideoUrl(null);

    try {
      const response = await fetch('http://localhost:8000/api/v1/reels/video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          script: generatedScriptDoc, // 1단계에서 LLM이 만든 규격 JSON 그대로 전달
          image_url: selectedProduct.image_url,
          resolution: '1080p',
          aspect_ratio: '9:16',
          generate_audio: false,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || '영상 생성 실패');
      }

      const data = await response.json();

      if (data.video_url) {
        setVideoUrl(data.video_url);
        setStep('COMPLETED');
      } else {
        throw new Error('반환된 영상 주소가 없습니다.');
      }
    } catch (error: any) {
      console.error(error);
      alert(`영상 생성 오류: ${error.message}`);
      setStep('SCRIPT');
    }
  };

  return (
    <main style={{ maxWidth: '720px', margin: '40px auto', padding: '24px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      
      <div style={{ borderBottom: '2px solid #111', paddingBottom: '16px', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 800 }}>AI 릴스 영상 생성 파이프라인</h2>
          <p style={{ margin: '6px 0 0 0', color: '#666', fontSize: '14px' }}>
            OpenRouter LLM 스크립트 $\rightarrow$ OpenRouter 비디오 렌더링 & 검증
          </p>
        </div>
        <span style={{ fontSize: '12px', background: '#e0f2fe', color: '#0369a1', padding: '4px 8px', borderRadius: '6px', fontWeight: 'bold' }}>
          {step}
        </span>
      </div>

      {/* Step 1: 상품 선택 */}
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
                  }}
                >
                  <div style={{ width: '56px', height: '56px', borderRadius: '8px', overflow: 'hidden', backgroundColor: '#f1f5f9', marginRight: '14px', flexShrink: 0 }}>
                    <img src={prod.image_url} alt={prod.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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
                    style={{ width: '18px', height: '18px', marginLeft: '12px' }}
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
            {loading ? statusText : `선택한 상품으로 AI 대본 작성하기 (OpenRouter LLM)`}
          </button>
        </div>
      )}

      {/* Step 2: 생성된 AI 대본 확인 */}
      {step === 'SCRIPT' && generatedScriptDoc && (
        <div>
          <button onClick={() => setStep('SELECT')} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', marginBottom: '12px', padding: 0 }}>
            ← 상품 다시 선택하기
          </button>
          
          <h3 style={{ fontSize: '18px', marginBottom: '4px' }}>AI 작성 스크립트 검증 완료</h3>
          <p style={{ color: '#666', fontSize: '13px', marginBottom: '16px' }}>
            타깃: <strong>{generatedScriptDoc.summary?.main_target || '보호자'}</strong> | 핵심 메시지: <strong>{generatedScriptDoc.summary?.key_message}</strong>
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
            {generatedScriptDoc.scenes?.map((scene: any, idx: number) => (
              <div key={idx} style={{ padding: '14px', border: '1px solid #e2e8f0', borderRadius: '8px', backgroundColor: '#f8fafc' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 'bold', color: idx === 0 ? '#dc2626' : idx === 1 ? '#2563eb' : '#16a34a' }}>
                    {scene.scene_name} ({scene.time_range_sec.start}~{scene.time_range_sec.end}초)
                  </span>
                  <span style={{ fontSize: '12px', color: '#64748b' }}>화면: {scene.visual}</span>
                </div>
                <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: '#0f172a' }}>
                  <strong>자막:</strong> {scene.auditory?.subtitle} / <strong>내레이션:</strong> "{scene.auditory?.voiceover}"
                </p>
              </div>
            ))}
          </div>

          <button
            onClick={handleGenerateVideo}
            style={{ width: '100%', padding: '16px', fontSize: '16px', fontWeight: 700, backgroundColor: '#0f172a', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
          >
            이 스크립트로 AI 영상 생성하기 (OpenRouter 1080p)
          </button>
        </div>
      )}

      {/* Step 3: 영상 생성/검증 진행 중 */}
      {step === 'GENERATING' && (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <div style={{ fontSize: '32px', marginBottom: '16px' }}>⚙️</div>
          <h3 style={{ fontSize: '18px', marginBottom: '8px' }}>OpenRouter가 영상을 생성하고 있습니다</h3>
          <p style={{ color: '#666', fontSize: '14px' }}>{statusText}</p>
          <p style={{ color: '#999', fontSize: '12px', marginTop: '8px' }}>영상 생성 완료 후 백엔드 FFprobe 메타데이터 검증을 수행합니다.</p>
        </div>
      )}

      {/* Step 4: 완료 및 재생 */}
      {step === 'COMPLETED' && videoUrl && (
        <div>
          <h3 style={{ fontSize: '18px', marginBottom: '8px' }}>🎉 AI 릴스 영상 생성 완료!</h3>
          <p style={{ color: '#666', fontSize: '13px', marginBottom: '20px' }}>기술 검증 통과 및 스트리밍 준비 완료</p>

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