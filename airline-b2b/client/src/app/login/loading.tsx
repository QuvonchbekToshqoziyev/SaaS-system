export default function LoginLoading() {
  return (
    <div className="flex min-h-screen bg-white">
      <div className="hidden lg:flex lg:w-1/2 xl:w-2/3 relative bg-[#0a0a0a] overflow-hidden">
        <video 
          src="/hero-video.mp4" 
          autoPlay 
          loop 
          muted 
          playsInline 
          className="absolute inset-0 w-full h-full object-cover opacity-80"
        />
        <div className="absolute inset-0 bg-gradient-to-tr from-blue-950/60 via-transparent to-transparent"></div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/10"></div>
        
        <div className="absolute top-10 left-10 flex items-center gap-4 z-10">
           <div className="w-12 h-12 bg-white/10 backdrop-blur-md flex items-center justify-center rounded-xl border border-white/20">
             <span className="text-foreground text-xl font-bold tracking-widest">ADO</span>
           </div>
           <div className="h-4 w-px bg-white/30"></div>
           <span className="text-muted text-xs font-semibold tracking-[0.2em] uppercase">B2B Platform</span>
        </div>
      </div>

      <div className="flex w-full flex-col justify-center bg-white px-8 py-16 lg:w-1/2 xl:w-1/3 relative border-l border-gray-100 items-center">
         <div className="w-10 h-10 border-[3px] border-primary/20 border-t-blue-600 rounded-full animate-spin mb-4"></div>
         <p className="text-gray-500 text-sm font-medium">Tizim yuklanmoqda...</p>
      </div>
    </div>
  );
}
