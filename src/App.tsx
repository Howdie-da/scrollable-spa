import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import Landing from './components/Landing'
import Revealed from './components/Revealed'

export default function App() {
  const [morph, setMorph] = useState(false)

  return (
    <>
      {/* Landing — centered layout */}
      <AnimatePresence>
        {!morph && (
          <motion.div
            key="landing-root"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.96, y: -20 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="min-h-screen bg-neutral-950 text-white text-center flex items-center justify-center p-6 overflow-hidden relative selection:bg-rose-500 selection:text-white"
          >
            {/* Ambient glow */}
            <div className="absolute w-[500px] h-[500px] rounded-full blur-3xl pointer-events-none bg-rose-600/20" />

            <div className="relative z-10 w-full max-w-5xl flex flex-col items-center justify-center">
              <Landing morph={morph} setMorph={setMorph} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Revealed — self-contained fixed overlay with its own scroll */}
      <AnimatePresence>
        {morph && (
          <motion.div
            key="revealed-root"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-0 z-30"
          >
            <Revealed morph={morph} setMorph={setMorph} />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
