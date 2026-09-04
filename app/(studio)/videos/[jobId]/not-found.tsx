import Link from 'next/link';

export default function NotFound() {
  return (
    <section className="route-state">
      <span className="state-symbol" aria-hidden="true">?</span>
      <h1>영상 작업을 찾을 수 없습니다</h1>
      <p>작업 ID를 확인하거나 라이브러리에서 다시 선택해 주세요.</p>
      <Link className="button button-primary" href="/videos">라이브러리로 이동</Link>
    </section>
  );
}
