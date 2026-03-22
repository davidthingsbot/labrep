import dynamic from 'next/dynamic';

const AppLayout = dynamic(
  () => import('@/components/Layout').then((mod) => ({ default: mod.AppLayout })),
  { ssr: false }
);

export default function Home() {
  return <AppLayout />;
}
