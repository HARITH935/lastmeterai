import { useEffect, useRef, useState, type RefObject } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import styles from './Landing.module.css'

function useScrollElevated() {
  const [elevated, setElevated] = useState(false)
  useEffect(() => {
    function onScroll() {
      setElevated(window.scrollY > 40)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  return elevated
}

function useReveal(rootRef: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    const els = Array.from(root.querySelectorAll(`.${styles.reveal}`))

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      els.forEach(el => el.classList.add(styles.inView))
      return
    }

    const io = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add(styles.inView)
            io.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.18 }
    )
    els.forEach(el => io.observe(el))
    return () => io.disconnect()
  }, [rootRef])
}

export function Landing() {
  const { user } = useAuth()
  const rootRef = useRef<HTMLDivElement>(null)
  const elevated = useScrollElevated()
  const reducedMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  useReveal(rootRef)

  // Already signed in — skip the marketing page
  if (user) {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <div className={styles.page} ref={rootRef}>
      <div className={styles.guilloche} />
      <div className={styles.vignette} />
      <div className={styles.grain} />
      <div className={styles.topHairline} />

      <div className={`${styles.navOuter} ${elevated ? styles.elevated : ''}`}>
        <div className={styles.wrap}>
          <nav className={styles.nav}>
            <div className={styles.wordmark}>
              LastMeter<span>-AI</span>
            </div>
            <div className={styles.navRight}>
              <div className={styles.navLinks}>
                <a className={styles.navLink} href="#product">Product</a>
                <a className={styles.navLink} href="#about">About</a>
              </div>
              <a className={`${styles.btn} ${styles.btnPrimary}`} href="/login">Sign in</a>
            </div>
          </nav>
        </div>
      </div>

      <section className={styles.hero}>
        <div className={styles.heroAtmosphere} />
        <div className={`${styles.wrap} ${styles.heroInner}`}>
          <div className={styles.heroCopy}>
            <div className={`${styles.eyebrow} ${styles.fadeUp}`} style={{ animationDelay: '0.02s' }}>
              GO / NO-GO INTELLIGENCE — CHENNAI
            </div>
            <h1 className={`${styles.headline} ${styles.fadeUp}`} style={{ animationDelay: '0.1s' }}>
              The last
              <br />
              <em className={styles.goldShimmer}>meter</em> decides
              <br />
              everything.
            </h1>
            <p className={`${styles.sub} ${styles.fadeUp}`} style={{ animationDelay: '0.2s' }}>
              LastMeter AI scores every order GO or NO-GO before it leaves the depot, then routes, tracks, and delivers.
            </p>
            <div className={`${styles.ctaRow} ${styles.fadeUp}`} style={{ animationDelay: '0.3s' }}>
              <a className={`${styles.btn} ${styles.btnPrimary} ${styles.btnLg}`} href="/login">
                Sign in to the console
              </a>
            </div>
          </div>

          <div className={`${styles.heroVisual} ${styles.fadeUp}`} style={{ animationDelay: '0.24s' }}>
            <svg className={styles.routeSvg} viewBox="0 0 620 520" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="routeGrad" x1="40" y1="460" x2="560" y2="70" gradientUnits="userSpaceOnUse">
                  <stop offset="0" stopColor="#A9772A" />
                  <stop offset="0.55" stopColor="#D9A54B" />
                  <stop offset="1" stopColor="#FFF3D0" />
                </linearGradient>
                <filter id="glow" x="-60%" y="-60%" width="220%" height="220%">
                  <feGaussianBlur stdDeviation="5" result="b" />
                  <feMerge>
                    <feMergeNode in="b" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              <line className={styles.gridLine} x1="40" y1="60" x2="40" y2="480" />
              <line className={styles.gridLine} x1="190" y1="20" x2="190" y2="480" />
              <line className={styles.gridLine} x1="340" y1="20" x2="340" y2="460" />
              <line className={styles.gridLine} x1="490" y1="20" x2="490" y2="420" />
              <line className={styles.gridLine} x1="20" y1="120" x2="580" y2="120" />
              <line className={styles.gridLine} x1="20" y1="260" x2="580" y2="260" />
              <line className={styles.gridLine} x1="20" y1="400" x2="580" y2="400" />

              <rect className={styles.mapBlock} x="90" y="150" width="70" height="48" />
              <rect className={styles.mapBlock} x="270" y="60" width="58" height="38" />
              <rect className={styles.mapBlock} x="410" y="270" width="88" height="58" />
              <rect className={styles.mapBlock} x="140" y="340" width="58" height="68" />

              <path className={styles.routeFaint} d="M 60 460 Q 250 430 340 400" />
              <path className={styles.routeFaint} d="M 60 460 Q 150 340 190 260" />
              <path className={styles.routeFaint} d="M 210 300 Q 380 260 490 180" />

              <path
                id="routePath"
                className={styles.routePath}
                d="M 60 460 C 140 460, 150 320, 210 300 S 340 200, 380 190 S 520 100, 560 80"
              />
              <path
                className={styles.routeDash}
                d="M 60 460 C 140 460, 150 320, 210 300 S 340 200, 380 190 S 520 100, 560 80"
              />

              <circle cx="340" cy="400" r="4" fill="#8290A3" />
              <text className={styles.mapLabelDim} x="340" y="418" textAnchor="middle">VELACHERY</text>
              <circle cx="190" cy="260" r="4" fill="#8290A3" />
              <text className={styles.mapLabelDim} x="190" y="246" textAnchor="middle">PORUR</text>
              <circle cx="490" cy="180" r="4" fill="#8290A3" />
              <text className={styles.mapLabelDim} x="490" y="166" textAnchor="middle">T NAGAR</text>

              <g>
                <circle cx="60" cy="460" r="8" fill="#F3ECDA" />
                <circle cx="60" cy="460" r="8" fill="none" stroke="#D9A54B" strokeWidth="1" opacity="0.5">
                  {!reducedMotion && (
                    <>
                      <animate attributeName="r" values="8;28;8" dur="3.2s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.5;0;0.5" dur="3.2s" repeatCount="indefinite" />
                    </>
                  )}
                </circle>
                <text className={styles.mapLabel} x="60" y="486" textAnchor="middle">DEPOT</text>
              </g>

              <circle cx="560" cy="80" r="10" fill="none" stroke="#D9A54B" strokeWidth="2" opacity="0.55">
                {!reducedMotion && (
                  <>
                    <animate attributeName="r" values="8;20;8" dur="2.4s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.6;0;0.6" dur="2.4s" repeatCount="indefinite" />
                  </>
                )}
              </circle>
              <circle cx="560" cy="80" r="6.5" fill="#F3D999" />
              <text className={styles.mapLabelGold} x="560" y="58" textAnchor="middle">ADYAR</text>

              <circle className={styles.routeDot} r="7" fill="#FFF3D0">
                {!reducedMotion && (
                  <animateMotion dur="4.5s" repeatCount="indefinite" rotate="auto">
                    <mpath href="#routePath" />
                  </animateMotion>
                )}
              </circle>
            </svg>
          </div>
        </div>
      </section>

      <section className={styles.statsStrip}>
        <div className={styles.wrap}>
          <div className={styles.statsGrid}>
            <div className={styles.stat}>
              <div className={`${styles.statNum} ${styles.goldShimmer}`}>73%</div>
              <div className={styles.statLabel}>Industry baseline success rate</div>
            </div>
            <div className={styles.stat}>
              <div className={`${styles.statNum} ${styles.goldShimmer}`}>₹300</div>
              <div className={styles.statLabel}>Cost of one failed delivery</div>
            </div>
            <div className={styles.stat}>
              <div className={`${styles.statNum} ${styles.goldShimmer}`}>20</div>
              <div className={styles.statLabel}>Chennai zones scored live</div>
            </div>
            <div className={styles.stat}>
              <div className={`${styles.statNum} ${styles.goldShimmer}`}>2-opt</div>
              <div className={styles.statLabel}>Live route optimization</div>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.quoteSection}>
        <div className={styles.wrap}>
          <div className={`${styles.quoteInner} ${styles.reveal}`}>
            <div className={styles.quoteRule} />
            <div>
              <p className={styles.quoteText}>
                One in four last-mile deliveries in India fails on the first attempt — from bad decisions, not bad
                drivers.
              </p>
              <p className={styles.quoteAttr}>RedSeer India, 2023</p>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.wrap} id="product">
        <div className={`${styles.sectionHead} ${styles.reveal}`}>
          <div className={styles.eyebrow}>What it does</div>
          <h2 className={styles.sectionTitle}>Four instruments, one console.</h2>
        </div>
        <div className={styles.pillars}>
          <div className={`${styles.pillar} ${styles.reveal}`}>
            <div className={styles.pillarTag}>SCORE</div>
            <h3 className={styles.pillarTitle}>GO / NO-GO</h3>
            <p className={styles.pillarDesc}>Scores every order before assignment.</p>
          </div>
          <div className={`${styles.pillar} ${styles.reveal}`} style={{ transitionDelay: '0.06s' }}>
            <div className={styles.pillarTag}>ROUTE</div>
            <h3 className={styles.pillarTitle}>Optimized routing</h3>
            <p className={styles.pillarDesc}>OSRM + TomTom + 2-opt, recalculated live.</p>
          </div>
          <div className={`${styles.pillar} ${styles.reveal}`} style={{ transitionDelay: '0.12s' }}>
            <div className={styles.pillarTag}>TRACK</div>
            <h3 className={styles.pillarTitle}>Live tracking</h3>
            <p className={styles.pillarDesc}>Mapbox navigation, Uber-style camera.</p>
          </div>
          <div className={`${styles.pillar} ${styles.reveal}`} style={{ transitionDelay: '0.18s' }}>
            <div className={styles.pillarTag}>NOTIFY</div>
            <h3 className={styles.pillarTitle}>Customer link</h3>
            <p className={styles.pillarDesc}>SMS/WhatsApp live tracking, no app.</p>
          </div>
        </div>
      </section>

      <section className={styles.about} id="about">
        <div className={styles.wrap}>
          <div className={`${styles.aboutPanel} ${styles.reveal}`}>
            <span className={`${styles.corner} ${styles.cornerTl}`} />
            <span className={`${styles.corner} ${styles.cornerTr}`} />
            <span className={`${styles.corner} ${styles.cornerBl}`} />
            <span className={`${styles.corner} ${styles.cornerBr}`} />
            <div className={`${styles.aboutEyebrow} ${styles.eyebrow}`}>About</div>
            <p className={styles.aboutText}>
              <strong className={styles.goldShimmer}>LastMeter AI</strong> is a GO / NO-GO decision system for
              last-mile delivery in Chennai — built to cut first-attempt failure by scoring risk before a single
              order leaves the depot.
            </p>
          </div>
        </div>
      </section>

      <section className={styles.ctaFinal}>
        <div className={styles.ctaAtmosphere} />
        <div className={styles.wrap}>
          <div className={`${styles.ctaFinalInner} ${styles.reveal}`}>
            <h2 className={styles.headline}>Stop finding out at the doorstep.</h2>
            <p className={styles.sub}>Accounts are provisioned by your dispatch manager.</p>
            <a className={`${styles.btn} ${styles.btnPrimary} ${styles.btnLg}`} href="/login">
              Sign in to the console
            </a>
          </div>
        </div>
      </section>

      <div className={styles.wrap}>
        <footer className={styles.footer}>
          <div className={styles.wordmark}>
            LastMeter<span>-AI</span>
          </div>
          <div>Precision last-mile intelligence for Chennai.</div>
        </footer>
      </div>
    </div>
  )
}
