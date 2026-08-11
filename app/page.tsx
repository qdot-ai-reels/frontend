'use client'; // Next.js 사용 시 필수 선언

import { useState } from 'react';

export default function Home() {
  const [prompt, setPrompt] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [loading, setLoading] = useState(false);

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      alert('요청문을 입력해주세요!');
      return;
    }

    setLoading(true);
    setVideoUrl('');

    try {
      // 로컬 테스트 시 http://localhost:8000, EC2 테스트 시 http://<EC2-PUBLIC-IP>:8000
      const response = await fetch('http://13.125.30.129:8000/api/v1/reels/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt }),
      });

      if (!response.ok) {
        throw new Error('API 요청 실패');
      }

      const data = await response.json();
      // 백엔드 응답의 video_url 저장
      setVideoUrl(data.video_url);
    } catch (error) {
      console.error(error);
      alert('영상 생성 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ maxWidth: '600px', margin: '50px auto', padding: '20px', fontFamily: 'sans-serif' }}>
      <h2>숏폼 영상 생성기</h2>

      {/* 1. 요청문 입력 영역 */}
      <div style={{ marginBottom: '15px' }}>
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="생성할 영상 프롬프트를 입력하세요 (예: 신제품 홍보 영상)"
          style={{
            width: '100%',
            padding: '12px',
            fontSize: '16px',
            borderRadius: '6px',
            border: '1px solid #ccc',
            boxSizing: 'border-box'
          }}
        />
      </div>

      {/* 2. 생성 버튼 */}
      <button
        onClick={handleGenerate}
        disabled={loading}
        style={{
          width: '100%',
          padding: '12px',
          fontSize: '16px',
          backgroundColor: loading ? '#ccc' : '#0070f3',
          color: '#fff',
          border: 'none',
          borderRadius: '6px',
          cursor: loading ? 'not-allowed' : 'pointer'
        }}
      >
        {loading ? '영상 생성 중...' : '생성'}
      </button>

      {/* 3. 영상 결과 영역 */}
      <div style={{ marginTop: '30px', textAlign: 'center' }}>
        {loading && <p>S3에서 영상을 불러오는 중입니다...</p>}
        
        {videoUrl ? (
          <div>
            <h3>생성 완료!</h3>
            <video
              src={videoUrl}
              controls
              autoPlay
              style={{ width: '100%', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
            />
          </div>
        ) : (
          !loading && <p style={{ color: '#888' }}>상단에 프롬프트를 입력하고 생성 버튼을 눌러주세요.</p>
        )}
      </div>
    </main>
  );
}