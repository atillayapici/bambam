import dynamic from 'next/dynamic';

const GameClient = dynamic(() => import('@/components/GameClient'), { 
  ssr: false,
  loading: () => <div className="flex h-screen items-center justify-center bg-black text-white text-2xl font-bold">Connecting to Server...</div>
});

export default function Home() {
  return (
    <main className="w-screen h-screen overflow-hidden bg-black m-0 p-0">
      <GameClient />
    </main>
  );
}
