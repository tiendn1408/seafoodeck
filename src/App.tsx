import { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCheck,
  CircleHelp,
  Clock3,
  Flag,
  Home,
  Layers3,
  Fish,
  ScanLine,
  Tags,
  PackageCheck,
  Library,
  Link2,
  ListChecks,
  LockKeyhole,
  RotateCcw,
  Search,
  ShieldCheck,
  Sprout,
  Target,
  Volume2,
  Waves,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { customerPack as pack } from './data/customer';
import { stateForPack } from './domain/packState';
import { ImageQuestion } from './components/ImageQuestion';
import { PUBLIC_CONTENT_ENABLED } from './data/public';
import { languageLabels, primaryName } from './domain/content';
import { audioPlayer } from './domain/media';
import type { AudioStatus } from './domain/media';
import type { AppState, Attempt, NameEntry, Question, Skill, StudySession } from './domain/models';
import { gradeHs, normalizeName } from './domain/scoring';
import {
  advanceSession,
  createSession,
  retryMistakes,
  retryCandidates,
  submitAttempt,
} from './domain/session';
import { loadState, saveState } from './domain/storage';

type View = 'home' | 'library' | 'review' | 'progress' | 'profile' | 'study';
const storage = {
  getItem: (key: string) => window.localStorage.getItem(key),
  setItem: (key: string, value: string) => window.localStorage.setItem(key, value),
};
const pageNames: Record<View, string> = {
  home: 'Góc học tập',
  library: 'Thư viện loài',
  review: 'Lịch ôn tập',
  progress: 'Tiến độ học',
  profile: 'Hồ sơ loài',
  study: 'Phiên học của bạn',
};
const navItems: { view: View; icon: LucideIcon; label: string }[] = [
  { view: 'home', icon: Home, label: 'Học tập' },
  { view: 'library', icon: Library, label: 'Thư viện' },
  { view: 'review', icon: RotateCcw, label: 'Ôn tập' },
  { view: 'progress', icon: Target, label: 'Tiến độ' },
];
const getView = (): View => {
  const hash = window.location.hash.slice(1).split(/[/?]/)[0];
  if (hash === 'profile') {
    const id = window.location.hash.split('/')[1];
    if (id && !pack.species.some((s) => s.id === id)) return 'library';
  }
  return Object.hasOwn(pageNames, hash) ? (hash as View) : 'home';
};
const selectedSpecies = () => {
  const id = window.location.hash.split('/')[1];
  return pack.species.some((s) => s.id === id) ? id : pack.species[0].id;
};
const titleFor = (id: string) =>
  primaryName(pack, id, 'vi')?.label ?? pack.scenarios.find((s) => s.id === id)?.title ?? id;
const skillLabel = (skill: Skill) =>
  skill === 'hs'
    ? 'Tình huống HS'
    : skill === 'image'
      ? 'Nhận diện ảnh'
      : skill === 'listening'
        ? 'Luyện nghe'
        : `${skill.startsWith('match:') ? 'Ghép' : 'Nhớ'} ${languageLabels[skill.split(':')[1] as 'en' | 'ja' | 'scientific'].toLowerCase()}`;
const dateLabel = (date: string) =>
  new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(
    new Date(date),
  );

function MarineMark() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 5h5l3 3 3-3h5v12c-3-2-5 2-8 0s-5 2-8 0V5Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path d="M4 12c3-2 5 2 8 0s5-2 8 0M12 8v9" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
function CephalopodIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7 11c-2-10 12-10 10 0M7 11c-1 2-4 2-4 5s4 3 4-1M9 11c-2 7-1 10 1 8l1-6M17 11c1 2 4 2 4 5s-4 3-4-1M15 11c2 7 1 10-1 8l-1-6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path d="M9 9h.1M15 9h.1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
function BivalveIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 18C-1 12 8 4 12 4s13 8 8 14c-3 4-13 4-16 0Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M12 5v15M12 5C8 10 6 13 6 18M12 5c4 5 6 8 6 13M4 15c5 3 11 3 16 0"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  );
}
function SpecimenImage({
  speciesId,
  className = '',
  lazy = false,
}: {
  speciesId: string;
  className?: string;
  lazy?: boolean;
}) {
  const asset = pack.media.find((m) => m.speciesId === speciesId && m.type === 'species_photo');
  const [failedPath, setFailedPath] = useState('');
  return asset && failedPath !== asset.path ? (
    <img
      className={className}
      src={asset.path}
      alt={`Ảnh ứng viên ${titleFor(speciesId)}`}
      width="500"
      height="300"
      loading={lazy ? 'lazy' : 'eager'}
      onError={() => setFailedPath(asset.path)}
    />
  ) : (
    <div className={`specimen-missing ${className}`}>
      <CephalopodIcon />
      <span>Ảnh loài đang bổ sung</span>
    </div>
  );
}
function Button({
  children,
  onClick,
  variant = 'primary',
  disabled = false,
  className = '',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      className={`btn btn-${variant} ${className}`}
      onClick={(event) => {
        if (event.detail > 1) return;
        onClick?.();
      }}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
function Eyebrow({ children }: { children: React.ReactNode }) {
  return <div className="eyebrow">{children}</div>;
}
function useClock() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const refresh = () => setNow(Date.now());
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, []);
  return now;
}
function AudioButton({ entry }: { entry: NameEntry }) {
  const [status, setStatus] = useState<AudioStatus>('idle');
  const [rate, setRate] = useState<1 | 0.75>(1);
  const asset = pack.media.find((m) => m.id === entry.audioAssetId);
  useEffect(() => () => audioPlayer.stop(), []);
  return (
    <div className="audio-control">
      <div className="audio-buttons">
        <button
          className="audio-btn"
          onClick={() => {
            if (status === 'playing') audioPlayer.stop();
            else void audioPlayer.play(asset, rate, setStatus);
          }}
          aria-label={`Nghe ${languageLabels[entry.kind]}`}
        >
          <Volume2 aria-hidden="true" size={16} />
          {status === 'playing' ? 'Dừng phát' : 'Nghe cách đọc'}
        </button>
        <button
          className="rate-btn"
          aria-label="Đổi tốc độ nghe"
          onClick={() => setRate(rate === 1 ? 0.75 : 1)}
        >
          {rate === 1 ? '1×' : '0.75×'}
        </button>
      </div>
      <span className={`audio-hint ${status === 'error' ? 'error-text' : ''}`} role="status">
        {status === 'error'
          ? 'Không phát được âm thanh — thử lại'
          : status === 'missing'
            ? 'Chưa có bản thu đã duyệt.'
            : !asset
              ? 'Bản thu đang được bổ sung'
              : status === 'playing'
                ? 'Đang phát…'
                : 'Tốc độ thường / chậm'}
      </span>
    </div>
  );
}

export default function App() {
  const [initial] = useState(() => loadState(storage));
  const [state, setState] = useState<AppState>(initial.state);
  const [warning, setWarning] = useState(initial.warning);
  const stateRef = useRef(initial.state);
  const now = useClock();
  const [view, setView] = useState<View>(getView);
  const [speciesId, setSpeciesId] = useState(selectedSpecies);
  const [direction, setDirection] = useState<'en' | 'ja' | 'scientific'>('en');
  const [showAbout, setShowAbout] = useState(false);
  const [notice, setNotice] = useState('');
  const mainRef = useRef<HTMLElement>(null);
  const previousView = useRef(view);
  useEffect(() => {
    const fn = () => {
      audioPlayer.stop();
      setView(getView());
      if (getView() === 'profile') setSpeciesId(selectedSpecies());
      window.scrollTo({ top: 0, behavior: 'instant' });
    };
    window.addEventListener('hashchange', fn);
    return () => {
      window.removeEventListener('hashchange', fn);
      audioPlayer.stop();
    };
  }, []);
  useEffect(() => {
    if (previousView.current !== view) mainRef.current?.focus({ preventScroll: true });
    previousView.current = view;
  }, [view]);
  const change = (fn: (previous: AppState) => AppState) => {
    const next = fn(stateRef.current);
    stateRef.current = next;
    setState(next);
    setWarning(saveState(storage, next));
  };
  const navigate = (next: View, targetSpecies = speciesId) => {
    audioPlayer.stop();
    window.location.assign(next === 'profile' ? `#profile/${targetSpecies}` : `#${next}`);
    setView(next);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  const visibleState = stateForPack(state, pack);
  const activeSession =
    !!state.session && !state.session.completedAt && state.session.contentVersion === pack.version;
  const due = Object.values(visibleState.reviews).filter((r) => Date.parse(r.dueAt) <= now);
  const automatic = visibleState.attempts.filter(
    (a) => !a.skipped && !a.selfRated && a.attemptNumber === 1,
  );
  const accuracy = automatic.length
    ? Math.round((automatic.filter((a) => a.correct).length / automatic.length) * 100)
    : null;
  const learned = new Set(
    visibleState.attempts
      .map((a) => a.targetId)
      .filter((id) => pack.species.some((s) => s.id === id)),
  ).size;
  const completedSessions = new Set(visibleState.attempts.map((a) => a.sessionId)).size;
  const weakSkill = Object.entries(
    automatic
      .filter((a) => !a.correct)
      .reduce<Partial<Record<Skill, number>>>(
        (counts, a) => ({ ...counts, [a.skill]: (counts[a.skill] ?? 0) + 1 }),
        {},
      ),
  ).sort((a, b) => b[1] - a[1])[0]?.[0] as Skill | undefined;
  function start(mode: StudySession['mode']) {
    if (activeSession) {
      setNotice('Bạn có một phiên đang học. Tiếp tục để giữ nguyên thứ tự câu và kết quả.');
      navigate('study');
      return;
    }
    const session = createSession(
      pack,
      mode,
      visibleState.reviews,
      direction,
      new Date().toISOString(),
      speciesId,
    );
    if (!session.questions.length) {
      setNotice(
        mode === 'image'
          ? 'Chưa đủ 3 ảnh thật hợp lệ cho lượt nhận diện. Bạn vẫn có thể học tên và ghép cặp.'
          : 'Chưa có mục đến hạn. Bạn có thể học một lượt mới trong lúc chờ.',
      );
      navigate(mode === 'image' ? 'home' : 'review');
      return;
    }
    change((s) => ({ ...s, session }));
    setNotice('');
    navigate('study');
  }
  const openProfile = (id = pack.species[0].id) => {
    setSpeciesId(id);
    navigate('profile', id);
  };

  return (
    <div className={`app-shell ${view === 'study' && activeSession ? 'focus-mode' : ''}`}>
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          mainRef.current?.focus({ preventScroll: true });
        }}
      >
        Đi đến nội dung
      </a>
      <header className="app-header">
        <div className="header-inner">
          <a className="brand" href="#home" aria-label="Seafood Deck trang chủ" translate="no">
            <span className="brand-symbol">
              <MarineMark />
            </span>
            <span>
              seafood<span className="brand-deck">deck</span>
              <span className="brand-dot">.</span>
            </span>
          </a>
          <span className="header-course">Sổ tay thủy hải sản</span>
          {view === 'study' && activeSession ? (
            <span className="focus-label">
              <BookOpen aria-hidden="true" size={15} /> Phiên học
            </span>
          ) : (
            <nav className="header-nav" aria-label="Điều hướng chính">
              {navItems.map(({ view: v, icon: Icon, label }) => (
                <a
                  key={v}
                  href={`#${v}`}
                  className={view === v || (v === 'library' && view === 'profile') ? 'active' : ''}
                  aria-current={
                    view === v || (v === 'library' && view === 'profile') ? 'page' : undefined
                  }
                >
                  <Icon aria-hidden="true" size={18} />
                  <span>{label}</span>
                  {v === 'review' && due.length > 0 && (
                    <span className="nav-count">{due.length}</span>
                  )}
                </a>
              ))}
            </nav>
          )}
          <button
            className="header-help"
            aria-label="Về Seafood Deck"
            onClick={() => setShowAbout(true)}
          >
            <CircleHelp aria-hidden="true" size={20} />
          </button>
        </div>
      </header>
      <div className="main-shell">
        <main
          id="main-content"
          className={`content ${view === 'home' ? 'home-content' : ''}`}
          ref={mainRef}
          tabIndex={-1}
        >
          {warning && (
            <div className="notice warning" role="alert">
              <CircleHelp aria-hidden="true" size={18} />
              <span>{warning}</span>
              <button aria-label="Đóng thông báo lưu trữ" onClick={() => setWarning(undefined)}>
                <X size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div className="notice" role="status">
              <CircleHelp aria-hidden="true" size={18} />
              <span>{notice}</span>
              <button aria-label="Đóng thông báo" onClick={() => setNotice('')}>
                <X size={16} />
              </button>
            </div>
          )}
          {view === 'home' && (
            <>
              <section className="trade-intro" aria-labelledby="trade-intro-title">
                <div className="trade-intro-copy">
                  <span className="course-label">
                    <span className="collection-dot" /> Thủy hải sản thương mại
                  </span>
                  <h1 id="trade-intro-title">
                    Hiểu loài.
                    <br />
                    Đọc đúng hàng.
                  </h1>
                  <p>Từ tên thương mại đến nhận diện nguyên liệu và quy cách lô hàng.</p>
                  <div className="trade-pillars">
                    <span>
                      <Tags size={15} aria-hidden="true" />
                      Tên thương mại
                    </span>
                    <span>
                      <ScanLine size={15} aria-hidden="true" />
                      Định danh loài
                    </span>
                    <span>
                      <PackageCheck size={15} aria-hidden="true" />
                      Quy cách hàng
                    </span>
                  </div>
                </div>
                <div className="trade-intro-art" aria-hidden="true">
                  <img
                    src="/media/illustrations/seafood-assortment-2d-v2.png"
                    alt=""
                    width="1536"
                    height="1024"
                    fetchPriority="high"
                  />
                </div>
              </section>
              <nav className="family-nav" aria-label="Nhóm hàng thủy hải sản">
                <a href="#library?group=C%C3%A1">
                  <Fish size={21} aria-hidden="true" />
                  <span>
                    Cá thịt trắng / đỏ<small>2 loài mẫu</small>
                  </span>
                  <ArrowRight size={15} aria-hidden="true" />
                </a>
                <a href="#library?group=M%E1%BB%B1c%20%26%20b%E1%BA%A1ch%20tu%E1%BB%99c">
                  <CephalopodIcon />
                  <span>
                    Mực & bạch tuộc<small>2 loài mẫu</small>
                  </span>
                  <ArrowRight size={15} aria-hidden="true" />
                </a>
                <a href="#library?group=Ngh%C3%AAu%20%26%20v%E1%BA%B9m">
                  <BivalveIcon />
                  <span>
                    Nghêu & vẹm<small>2 loài mẫu</small>
                  </span>
                  <ArrowRight size={15} aria-hidden="true" />
                </a>
              </nav>
              {state.session && state.session.contentVersion !== pack.version && (
                <div className="pack-update-note">
                  <BookOpen size={18} aria-hidden="true" />
                  <p>
                    Bộ học đã đổi sang thủy hải sản thương mại. Lịch sử bộ cũ được giữ riêng; lượt
                    mới dùng dữ liệu hiện tại.
                  </p>
                </div>
              )}
              {activeSession && (
                <section className="resume-banner" aria-label="Phiên học đang dở">
                  <BookOpen aria-hidden="true" size={21} />
                  <div>
                    <h2>Phiên học đang dở</h2>
                    <p>
                      Bước {state.session!.cursor + 1} / {state.session!.questions.length}
                    </p>
                  </div>
                  <Button onClick={() => navigate('study')}>
                    Tiếp tục phiên học <ArrowRight aria-hidden="true" size={17} />
                  </Button>
                </section>
              )}
              <section className="modes-section" aria-label="Chọn chế độ học">
                <div className="lesson-toolbar">
                  <h2>Luyện nghiệp vụ</h2>
                  <span>Demo 6 loài · Nội dung chờ duyệt</span>
                </div>
                <div className="learning-selection">
                  <label>
                    <span>Loài học tên</span>
                    <select
                      aria-label="Chọn loài học tên"
                      value={speciesId}
                      onChange={(e) => setSpeciesId(e.target.value)}
                    >
                      {pack.species.map((s) => (
                        <option value={s.id} key={s.id}>
                          {titleFor(s.id)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Hướng ghép tên</span>
                    <select
                      aria-label="Chọn hướng ghép tên"
                      value={direction}
                      onChange={(e) => setDirection(e.target.value as typeof direction)}
                    >
                      <option value="en">Việt → Anh</option>
                      <option value="ja">Việt → Nhật</option>
                      <option value="scientific">Việt → Khoa học</option>
                    </select>
                  </label>
                </div>
                <div className="mode-grid">
                  <ModeCard
                    icon={BookOpen}
                    color="mint"
                    tag="flash"
                    title="Flashcard tên loài"
                    text="Nhớ tên Anh, Nhật và khoa học trong giao dịch."
                    footer={`3 thẻ · ${titleFor(speciesId)}`}
                    onClick={() => start('flashcard')}
                  />
                  <ModeCard
                    icon={Tags}
                    color="peach"
                    tag="match"
                    title="Ghép tên thương mại"
                    text="Đối chiếu tên Việt với tên của cùng một loài."
                    footer="3 cặp · Từ bộ 6 loài"
                    onClick={() => start('match')}
                  />
                  <ModeCard
                    icon={ScanLine}
                    color="mint"
                    tag="image"
                    title="Đoán hình nguyên liệu"
                    text="Quan sát mẫu, nhận ra loài và dấu hiệu phân biệt."
                    footer="3 câu · Ảnh thật chưa duyệt"
                    onClick={() => start('image')}
                  />
                  <ModeCard
                    icon={PackageCheck}
                    color="lavender"
                    tag="hs"
                    title="HS theo dạng hàng"
                    text="Cá ngừ nguyên con, phi lê và hồ sơ thiếu dữ kiện."
                    footer="3 hồ sơ mẫu · Cấp 6 số"
                    onClick={() => start('hs')}
                  />
                </div>
              </section>
              <a href="#library" className="course-shelf">
                <Library size={23} aria-hidden="true" />
                <span>
                  <strong>Sổ tay 6 loài thủy hải sản</strong>
                  <small>Tên loài · dấu hiệu phân biệt · dạng hàng</small>
                </span>
                <ArrowRight size={19} aria-hidden="true" />
              </a>
            </>
          )}
          {view === 'progress' && (
            <>
              <div className="page-heading">
                <div>
                  <Eyebrow>Lịch sử trên thiết bị này</Eyebrow>
                  <h1>Tiến độ học của bạn</h1>
                  <p>Theo dõi kết quả và kỹ năng cần luyện thêm.</p>
                </div>
              </div>
              <div className="dashboard-grid">
                <section className="progress-section" aria-labelledby="progress-title">
                  <div className="section-heading">
                    <h2 id="progress-title">Tiến độ của bạn</h2>
                    <span className="section-meta">{completedSessions} lượt đã bắt đầu</span>
                  </div>
                  <div className="stats-row">
                    <Stat
                      icon={Layers3}
                      value={`${learned} / ${pack.species.length}`}
                      label="Loài đã học"
                      color="mint"
                    />
                    <Stat
                      icon={Target}
                      value={accuracy === null ? '—' : `${accuracy}%`}
                      label="Đúng ở lần đầu"
                      color="peach"
                    />
                    <Stat
                      icon={RotateCcw}
                      value={String(due.length)}
                      label="Mục đến hạn ôn"
                      color="lavender"
                    />
                  </div>
                  {weakSkill && (
                    <button className="home-weak-skill" onClick={() => navigate('review')}>
                      <Target aria-hidden="true" size={18} />
                      <span>
                        Cần luyện thêm: <strong>{skillLabel(weakSkill)}</strong>
                      </span>
                      <ArrowRight aria-hidden="true" size={16} />
                    </button>
                  )}
                  <div className="review-nudge">
                    <div>
                      <h3>
                        {due.length
                          ? `${due.length} mục đã đến hạn ôn`
                          : 'Ôn đúng lúc để nhớ lâu hơn'}
                      </h3>
                      <p>Lịch ôn riêng cho từng kỹ năng: 1, 3, 7 và 14 ngày.</p>
                    </div>
                    <button className="text-link" onClick={() => navigate('review')}>
                      Xem lịch ôn <ArrowRight aria-hidden="true" size={17} />
                    </button>
                  </div>
                </section>
                <aside className="content-status">
                  <ShieldCheck aria-hidden="true" size={23} />
                  <h2>Bản học thử nội bộ</h2>
                  <p>
                    Năm ảnh thật là ứng viên nội bộ; ảnh mực đang bổ sung. Chưa có bản thu phát âm
                    đã duyệt. Bài HS dùng hồ sơ mẫu và nguồn ghi riêng.
                  </p>
                  <button className="text-link" onClick={() => setShowAbout(true)}>
                    Xem trạng thái nội dung <ArrowRight aria-hidden="true" size={16} />
                  </button>
                </aside>
              </div>
            </>
          )}
          {view === 'library' && (
            <LibraryView
              onProfile={openProfile}
              direction={direction}
              setDirection={setDirection}
              onMatch={() => start('match')}
            />
          )}
          {view === 'profile' && (
            <Profile
              speciesId={speciesId}
              onBack={() => navigate('library')}
              onStart={() => start('full')}
              onFlash={() => start('flashcard')}
              onHs={() => start('hs')}
            />
          )}
          {view === 'review' && (
            <ReviewView
              state={visibleState}
              onStart={() => start('review')}
              onLearn={() => openProfile()}
            />
          )}
          {view === 'study' && (
            <Study
              state={state}
              change={change}
              onHome={() => navigate('home')}
              onReview={() => navigate('review')}
              onLearn={() => openProfile()}
            />
          )}
          {!(view === 'study' && activeSession) && (
            <footer className="page-footer">
              <span>
                <Waves aria-hidden="true" size={15} /> Seafood Deck
              </span>
              <button onClick={() => setShowAbout(true)}>
                <ShieldCheck aria-hidden="true" size={14} /> Bản nội bộ · Trạng thái nội dung
              </button>
            </footer>
          )}
        </main>
      </div>
      {showAbout && (
        <div className="modal-backdrop" onClick={() => setShowAbout(false)}>
          <AboutModal onClose={() => setShowAbout(false)} />
        </div>
      )}
    </div>
  );
}

function Stat({
  icon: Icon,
  value,
  label,
  color,
}: {
  icon: LucideIcon;
  value: string;
  label: string;
  color: string;
}) {
  return (
    <div className="stat">
      <span className={`icon-tile ${color}`}>
        <Icon aria-hidden="true" size={20} />
      </span>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </div>
  );
}
function ModeCard({
  icon: Icon,
  color,
  tag,
  title,
  text,
  footer,
  onClick,
}: {
  icon: LucideIcon;
  color: string;
  tag: string;
  title: string;
  text: string;
  footer: string;
  onClick: () => void;
}) {
  return (
    <button className={`mode-card mode-${tag}`} onClick={onClick}>
      <div className="mode-visual" aria-hidden="true">
        <Icon size={30} />
        <span>{tag === 'hs' ? 'Dạng hàng' : tag === 'image' ? 'Nguyên liệu' : 'Tên loài'}</span>
      </div>
      <div className="mode-copy">
        <h2>
          <Icon aria-hidden="true" size={18} className={color} />
          {title}
        </h2>
        <p>{text}</p>
        <div className="mode-footer">
          <span>{footer}</span>
          <ArrowRight aria-hidden="true" size={17} />
        </div>
      </div>
    </button>
  );
}
function LibraryView({
  onProfile,
  direction,
  setDirection,
  onMatch,
}: {
  onProfile: (id: string) => void;
  direction: 'en' | 'ja' | 'scientific';
  setDirection: (v: 'en' | 'ja' | 'scientific') => void;
  onMatch: () => void;
}) {
  const [query, setQuery] = useState('');
  const groupFromUrl = () =>
    new URLSearchParams(window.location.hash.split('?')[1]).get('group') ?? '';
  const [group, setGroup] = useState(groupFromUrl);
  useEffect(() => {
    const sync = () => setGroup(groupFromUrl());
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);
  const filterGroup = (value: string) => {
    setGroup(value);
    window.history.replaceState(
      null,
      '',
      value ? `#library?group=${encodeURIComponent(value)}` : '#library',
    );
  };
  const list = pack.species.filter(
    (s) =>
      (!group || s.group === group) &&
      pack.names.some(
        (n) =>
          n.speciesId === s.id &&
          (n.role === 'primary' || n.status === 'approved') &&
          normalizeName(n.label).includes(normalizeName(query)),
      ),
  );
  return (
    <>
      {window.location.hash.startsWith('#profile/') && (
        <div className="notice" role="status">
          Hồ sơ trong đường dẫn không thuộc bộ đang mở. Hãy chọn một loài bên dưới.
        </div>
      )}
      <div className="page-heading library-heading">
        <div>
          <Eyebrow>Thủy hải sản thương mại</Eyebrow>
          <h1>
            Thư viện loài<span className="orange">.</span>
          </h1>
          <p>Tra cứu tên Việt, Anh, Nhật và khoa học trong cùng một nơi.</p>
        </div>
        <span className="count-pill">{pack.species.length} loài · Bộ mẫu</span>
        <img
          className="library-heading-art"
          src="/media/illustrations/seafood-notebook-2d-v2.png"
          alt=""
          aria-hidden="true"
          width="1536"
          height="1024"
        />
      </div>
      <div className="library-tools">
        <label className="search-field">
          <Search aria-hidden="true" size={19} />
          <input
            aria-label="Tìm loài theo bốn tên gọi"
            name="species-search"
            autoComplete="off"
            type="search"
            placeholder="Tìm tên loài, tên tiếng Nhật, tên khoa học…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button onClick={() => setQuery('')} aria-label="Xóa tìm kiếm">
              <X size={16} />
            </button>
          )}
        </label>
      </div>
      <div className="group-filters" aria-label="Lọc nhóm hàng">
        {['', 'Cá', 'Mực & bạch tuộc', 'Nghêu & vẹm'].map((g) => (
          <button key={g} aria-pressed={group === g} onClick={() => filterGroup(g)}>
            {g || 'Tất cả nhóm'}
          </button>
        ))}
      </div>
      <div className="library-grid">
        {list.map((s, i) => (
          <button key={s.id} className="library-card" onClick={() => onProfile(s.id)}>
            <div className={`library-cover cover-${i}`}>
              <span>{s.tradeCategory}</span>
              <SpecimenImage speciesId={s.id} className="library-photo" lazy />
            </div>
            <div className="library-card-content">
              <span className="draft-pill">Nội dung chờ duyệt</span>
              <h2>{titleFor(s.id)}</h2>
              <p>{primaryName(pack, s.id, 'en')?.label}</p>
              <em>{s.scientificName}</em>
              <div className="library-card-footer">
                <span>
                  VI <i /> EN <i /> JP <i /> SCI
                </span>
                <span className="circle-arrow">
                  <ArrowRight aria-hidden="true" size={17} />
                </span>
              </div>
            </div>
          </button>
        ))}
      </div>
      {!list.length && (
        <div className="empty-card">
          <Search aria-hidden="true" size={30} />
          <h2>Chưa tìm thấy loài này</h2>
          <p>Thử một tên gọi khác hoặc xóa từ khóa để xem cả bộ thẻ.</p>
          <Button
            variant="secondary"
            onClick={() => {
              setQuery('');
              filterGroup('');
            }}
          >
            Xem tất cả loài
          </Button>
        </div>
      )}
      <div className="library-practice">
        <span className="icon-tile peach">
          <Link2 aria-hidden="true" size={24} />
        </span>
        <div>
          <h3>Luyện ghép tên chuyên ngành</h3>
          <p>Chọn hướng ghép cho bàn chơi 3 cặp.</p>
        </div>
        <label className="select-label">
          <span className="sr-only">Ngôn ngữ ghép tên</span>
          <select
            value={direction}
            onChange={(e) => setDirection(e.target.value as typeof direction)}
          >
            <option value="en">Việt → Anh</option>
            <option value="ja">Việt → Nhật</option>
            <option value="scientific">Việt → Khoa học</option>
          </select>
        </label>
        <Button onClick={onMatch}>
          Chơi ghép tên
          <ArrowRight aria-hidden="true" size={16} />
        </Button>
      </div>
      <div className="content-note">
        <ShieldCheck aria-hidden="true" size={18} />
        <p>
          Bộ mẫu gồm 6 loài, không phải danh mục kinh doanh đã xác nhận của khách. Tên gọi và ảnh
          nhận diện đang chờ chuyên gia duyệt; chưa có bản thu phát âm đã duyệt.
        </p>
      </div>
    </>
  );
}
function Profile({
  speciesId,
  onBack,
  onStart,
  onFlash,
  onHs,
}: {
  speciesId: string;
  onBack: () => void;
  onStart: () => void;
  onFlash: () => void;
  onHs: () => void;
}) {
  const species = pack.species.find((s) => s.id === speciesId)!;
  return (
    <>
      <button className="back-link" onClick={onBack}>
        <ArrowLeft aria-hidden="true" size={16} />
        Thư viện loài
      </button>
      <div className="profile-header">
        <div>
          <Eyebrow>Hồ sơ loài · {species.tradeCategory}</Eyebrow>
          <h1>
            {titleFor(speciesId)}
            <span className="orange">.</span>
          </h1>
          <p className="latin-title">{species.scientificName}</p>
        </div>
        <span className="draft-pill">
          {species.fixtureOnly ? 'Nội dung đối chiếu · Chờ duyệt' : 'Bản nháp · Chờ duyệt nội dung'}
        </span>
      </div>
      <section className="specimen-record">
        <div className="profile-photo">
          <SpecimenImage speciesId={speciesId} />
          <span>
            {pack.media.some((m) => m.speciesId === speciesId)
              ? 'Ảnh thật ứng viên · Chưa duyệt nhận diện'
              : 'Chưa có ảnh loài phù hợp'}
          </span>
        </div>
        <div className="specimen-ledger">
          <div>
            <span className="ledger-label">Nhóm hàng</span>
            <strong>
              {species.group} · {species.tradeCategory}
            </strong>
          </div>
          <div>
            <span className="ledger-label">Quan sát nguyên liệu</span>
            <p>{species.identification}</p>
          </div>
          <div>
            <span className="ledger-label">Dạng hàng tham khảo</span>
            <div className="product-form-tags">
              {species.productForms?.map((f) => (
                <span key={f}>{f}</span>
              ))}
            </div>
          </div>
        </div>
      </section>
      <div className="commercial-note">
        <Tags size={18} aria-hidden="true" />
        <div>
          <strong>Lưu ý khi gọi tên hàng</strong>
          <p>{species.commercialNote}</p>
          <p>{species.notes}</p>
        </div>
      </div>
      <div className="profile-intro">
        <BookOpen aria-hidden="true" size={23} />
        <div>
          <strong>Một loài, bốn tên gọi</strong>
          <p>
            Đọc, thử nhớ và lật thẻ. Phiên âm dưới đây là bản nháp, cần đối chiếu với bản thu trước
            khi phát hành.
          </p>
        </div>
      </div>
      <div className="name-grid">
        {(['vi', 'en', 'ja', 'scientific'] as const).map((kind, i) => {
          const entry = primaryName(pack, speciesId, kind)!;
          return (
            <section className={`name-card name-${kind}`} key={kind}>
              <div className="name-card-heading">
                <span className="language-code">{['VI', 'EN', 'JP', 'SCI'][i]}</span>
                <span>{languageLabels[kind]}</span>
                <span className="name-number">0{i + 1}</span>
              </div>
              <h2 className={kind === 'scientific' ? 'italic' : ''}>{entry.label}</h2>
              {entry.pronunciation ? (
                <p className="pronunciation">{entry.pronunciation.text}</p>
              ) : (
                <p className="pronunciation muted">
                  {kind === 'vi' ? 'Tên gọi tiếng Việt' : 'Phiên âm đang được bổ sung'}
                </p>
              )}
              <p className="name-source-note">
                Nguồn: {pack.sources.find((s) => s.id === entry.sourceId)?.title}
              </p>
              {kind !== 'vi' ? (
                <AudioButton entry={entry} />
              ) : (
                <div className="name-vietnamese-footer">
                  <span className="collection-dot" />
                  Tên chính trong bộ demo
                </div>
              )}
            </section>
          );
        })}
      </div>
      <button className="hs-profile-link" onClick={onHs}>
        <span className="icon-tile lavender">
          <ListChecks aria-hidden="true" size={22} />
        </span>
        <div>
          <h3>Luyện đọc dạng hàng · HS</h3>
          <p>
            Bộ demo HS gồm 3 hồ sơ cá ngừ vây vàng. Mã thay đổi theo dạng hàng và phiên bản danh
            mục.
          </p>
        </div>
        <ArrowRight aria-hidden="true" size={21} />
      </button>
      <div className="profile-actions">
        <Button variant="secondary" onClick={onFlash}>
          Chỉ học flashcard · 3 thẻ
        </Button>
        <Button onClick={onStart}>
          Học trọn lượt
          <ArrowRight aria-hidden="true" size={18} />
        </Button>
        <span>
          <Clock3 aria-hidden="true" size={15} /> Lượt đầy đủ gồm thẻ, ghép tên và HS
        </span>
      </div>
      <details className="source-details">
        <summary>Nguồn & trạng thái nội dung</summary>
        <p>{pack.sources.find((s) => s.id === species.sourceId)?.title}</p>
        <p>{pack.sources.find((s) => s.id === species.sourceId)?.location}</p>
        <p>
          Chưa có người duyệt nội dung hoặc bản thu phát âm. Hướng dẫn đọc Nhật là bản nháp; IPA Anh
          và hướng dẫn đọc khoa học đang bổ sung. Bộ public chưa mở.
        </p>
        {species.tradeSourceId && (
          <p>
            Nhóm thương mại:{' '}
            <a
              href={pack.sources.find((s) => s.id === species.tradeSourceId)?.url}
              target="_blank"
              rel="noreferrer"
            >
              {pack.sources.find((s) => s.id === species.tradeSourceId)?.title}
            </a>{' '}
            — {pack.sources.find((s) => s.id === species.tradeSourceId)?.location}
          </p>
        )}
        {pack.names
          .filter((n) => n.speciesId === speciesId && n.role === 'primary')
          .map((n) => (
            <p key={n.id}>
              <strong>{languageLabels[n.kind]}: </strong>
              <a
                href={pack.sources.find((s) => s.id === n.sourceId)?.url}
                target="_blank"
                rel="noreferrer"
              >
                {pack.sources.find((s) => s.id === n.sourceId)?.title}
              </a>{' '}
              — {pack.sources.find((s) => s.id === n.sourceId)?.location}
            </p>
          ))}
        {pack.media
          .filter((m) => m.speciesId === speciesId)
          .map((m) => (
            <p key={m.id}>
              {m.credit} · {m.rights} ·{' '}
              <a href={m.sourceUrl} target="_blank" rel="noreferrer">
                Nguồn ảnh
              </a>{' '}
              ·{' '}
              <a href={m.licenseUrl} target="_blank" rel="noreferrer">
                Điều kiện sử dụng
              </a>
            </p>
          ))}
      </details>
    </>
  );
}
function ReviewView({
  state,
  onStart,
  onLearn,
}: {
  state: AppState;
  onStart: () => void;
  onLearn: () => void;
}) {
  const now = useClock();
  const rows = Object.values(state.reviews).sort(
    (a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt),
  );
  const isDue = (r: (typeof rows)[number]) => Date.parse(r.dueAt) <= now;
  const due = rows.filter(isDue);
  const wrong = state.attempts.filter((a) => !a.skipped && !a.selfRated && !a.correct);
  const weak = Object.entries(
    wrong.reduce<Record<string, number>>(
      (acc, a) => ({ ...acc, [a.skill]: (acc[a.skill] ?? 0) + 1 }),
      {},
    ),
  ).sort((a, b) => b[1] - a[1]);
  return (
    <>
      <div className="page-heading">
        <div>
          <Eyebrow>Lịch học cá nhân</Eyebrow>
          <h1>
            Góc ôn tập của bạn<span className="orange">.</span>
          </h1>
          <p>Mỗi kỹ năng có lịch riêng. Tiến bộ từng chút, nhớ chắc từng phần.</p>
        </div>
        {due.length > 0 && (
          <Button onClick={onStart}>
            Ôn {due.length} mục đến hạn
            <ArrowRight aria-hidden="true" size={17} />
          </Button>
        )}
      </div>
      <div className="review-overview">
        <Stat
          icon={RotateCcw}
          value={String(due.length).padStart(2, '0')}
          label="Mục đến hạn"
          color="mint"
        />
        <Stat
          icon={Clock3}
          value={String(rows.length - due.length).padStart(2, '0')}
          label="Mục đang chờ"
          color="peach"
        />
        <Stat
          icon={Target}
          value={String(rows.filter((r) => r.stage > 0).length).padStart(2, '0')}
          label="Kỹ năng đã tăng bậc"
          color="lavender"
        />
      </div>
      {rows.length ? (
        <section className="review-table">
          <div className="table-header">
            <h2>Hàng đợi ôn tập</h2>
            <span>1 → 3 → 7 → 14 ngày</span>
          </div>
          {rows.map((r) => (
            <div className="review-row" key={r.key}>
              <span className={`icon-tile ${r.skill === 'hs' ? 'lavender' : 'mint'} small`}>
                {r.skill === 'hs' ? (
                  <ListChecks aria-hidden="true" size={18} />
                ) : (
                  <BookOpen aria-hidden="true" size={18} />
                )}
              </span>
              <div className="review-row-title">
                <strong>{titleFor(r.targetId)}</strong>
                <span>
                  {skillLabel(r.skill)}
                  {r.selfRated ? ' · Tự đánh giá' : ''}
                </span>
              </div>
              <span className="review-stage">Mốc {[1, 3, 7, 14][r.stage]} ngày</span>
              <span className={`due-label ${isDue(r) ? 'is-due' : ''}`}>
                {isDue(r) ? 'Đến hạn' : dateLabel(r.dueAt)}
              </span>
            </div>
          ))}
        </section>
      ) : (
        <div className="empty-card">
          <img
            className="review-empty-art"
            src="/media/illustrations/seafood-review-2d-v2.png"
            alt=""
            aria-hidden="true"
            width="1536"
            height="1024"
            loading="lazy"
          />
          <h2>Chưa có mục ôn tập</h2>
          <p>
            Học xong một lượt, các kỹ năng sẽ xuất hiện ở đây
            <br />
            với lịch ôn phù hợp cho từng mục.
          </p>
          <Button onClick={onLearn}>
            Mở hồ sơ loài
            <ArrowRight aria-hidden="true" size={17} />
          </Button>
        </div>
      )}
      {rows.length > 0 && !due.length && (
        <div className="content-note">
          <CheckCheck aria-hidden="true" size={20} />
          <p>
            Bạn chưa có mục đến hạn. Có thể ôn lỗi ngay ở tổng kết phiên vừa học hoặc khám phá thêm
            ở thư viện.
          </p>
        </div>
      )}
      {weak.length > 0 && (
        <section className="weak-skills">
          <Eyebrow>KỸ NĂNG CẦN CHĂM CHÚT</Eyebrow>
          <div>
            {weak.map(([skill, count]) => (
              <span key={skill}>
                {skillLabel(skill as Skill)} <strong>{count} lần sai</strong>
              </span>
            ))}
          </div>
        </section>
      )}
      <p className="review-explainer">
        Tự đánh giá flashcard được lưu riêng. Chỉ câu trả lời tự động đúng ở phiên ôn sau mới tăng
        bậc; làm lại trong cùng phiên không tăng bậc.
      </p>
    </>
  );
}

function Study({
  state,
  change,
  onHome,
  onReview,
  onLearn,
}: {
  state: AppState;
  change: (fn: (s: AppState) => AppState) => void;
  onHome: () => void;
  onReview: () => void;
  onLearn: () => void;
}) {
  const session = state.session;
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [session?.id, session?.cursor, session?.completedAt]);
  if (!session)
    return (
      <div className="empty-card">
        <Layers3 aria-hidden="true" size={35} />
        <h1>Chọn một chế độ để bắt đầu</h1>
        <p>Chọn loài trong sổ tay để học tên hoặc mở một lượt luyện nghiệp vụ.</p>
        <Button onClick={onLearn}>
          Mở hồ sơ loài
          <ArrowRight aria-hidden="true" size={16} />
        </Button>
      </div>
    );
  if (session.contentVersion !== pack.version)
    return (
      <div className="empty-card">
        <CircleHelp aria-hidden="true" size={34} />
        <h2>Nội dung đã được cập nhật</h2>
        <p>Lịch sử được giữ nguyên. Hãy mở phiên mới với nội dung hiện tại.</p>
        <Button onClick={() => change((s) => ({ ...s, session: null }))}>Mở phiên mới</Button>
      </div>
    );
  if (session.completedAt)
    return (
      <Summary
        state={state}
        onReview={onReview}
        onHome={onHome}
        onRetry={() => change((s) => retryMistakes(s))}
        onRetrySkipped={() => change((s) => retryMistakes(s, true))}
      />
    );
  const q = session.questions[session.cursor];
  const attempts = state.attempts.filter(
    (a) => a.sessionId === session.id && a.questionId === q.id,
  );
  const ui = session.ui[q.id] ?? {};
  function updateUi(value: Partial<typeof ui>) {
    change((s) =>
      s.session
        ? {
            ...s,
            session: {
              ...s.session,
              ui: { ...s.session.ui, [q.id]: { ...s.session.ui[q.id], ...value } },
            },
          }
        : s,
    );
  }
  const record = (
    targetId: string,
    skill: Skill,
    correct: boolean,
    answer: string,
    selfRated = false,
    skipped = false,
  ) => {
    change((s) => {
      const attemptNumber =
        s.attempts.filter(
          (a) =>
            a.sessionId === session.id &&
            a.targetId === targetId &&
            a.skill === skill &&
            !a.skipped,
        ).length + 1;
      const attempt: Attempt = {
        id: `${session.id}/${q.id}/${targetId}/${attemptNumber}`,
        sessionId: session.id,
        questionId: q.id,
        targetId,
        skill,
        correct,
        answer,
        selfRated,
        skipped,
        isReview: session.mode === 'review',
        attemptNumber,
        contentVersion: session.contentVersion,
        at: new Date().toISOString(),
      };
      return submitAttempt(s, attempt);
    });
  };
  return (
    <div className={`study-wrap ${q.type === 'flashcard' ? 'flashcard-session' : ''}`}>
      <div className="study-top">
        <button className="back-link" onClick={onHome}>
          <ArrowLeft aria-hidden="true" size={16} />
          Lưu & quay về
        </button>
        <span className="study-internal">Nội bộ · Chờ duyệt</span>
      </div>
      <div className="study-progress">
        <span>
          Bước {String(session.cursor + 1).padStart(2, '0')} /{' '}
          {String(session.questions.length).padStart(2, '0')}
        </span>
        <div>
          <i style={{ width: `${(session.cursor / session.questions.length) * 100}%` }} />
        </div>
        <span>
          {q.type === 'flashcard'
            ? 'Làm quen'
            : q.type === 'match'
              ? 'Ghép tên'
              : q.type === 'image'
                ? 'Đoán hình'
                : 'Tình huống HS'}
        </span>
      </div>
      {q.type === 'flashcard' && (
        <Flashcard
          key={q.id}
          question={q}
          flipped={!!ui.flipped}
          attempt={attempts[0]}
          onFlip={() => updateUi({ flipped: !ui.flipped })}
          onRate={(correct) =>
            record(q.speciesId, `name:${q.kind}`, correct, correct ? 'remembered' : 'not-yet', true)
          }
        />
      )}
      {q.type === 'match' && (
        <MatchBoard
          key={q.id}
          question={q}
          attempts={attempts}
          onAnswer={(id, correct, answer) => record(id, `match:${q.kind}`, correct, answer)}
        />
      )}
      {q.type === 'image' && (
        <ImageQuestion
          key={q.id}
          question={q}
          choice={ui.choice}
          attempt={attempts[0]}
          onChoice={(choice) => updateUi({ choice })}
          onSubmit={(correct, answer) => record(q.speciesId, 'image', correct, answer)}
          onSkip={() => record(q.speciesId, 'image', false, 'skipped', false, true)}
        />
      )}
      {q.type === 'hs' && (
        <HsQuestion
          key={q.id}
          question={q}
          choice={ui.choice}
          followUp={ui.followUp}
          attempt={attempts[0]}
          onChange={updateUi}
          onSubmit={(correct, answer) => record(q.scenarioId, 'hs', correct, answer)}
        />
      )}
      {(q.type === 'match'
        ? q.pairs.every((p) => attempts.some((a) => a.targetId === p.speciesId && a.correct))
        : !!attempts.length) && (
        <div className="next-row">
          <Button
            onClick={() => {
              audioPlayer.stop();
              change((s) =>
                s.session?.questions[s.session.cursor]?.id === q.id ? advanceSession(s) : s,
              );
            }}
          >
            {session.cursor === session.questions.length - 1 ? 'Xem tổng kết' : 'Tiếp tục'}
            <ArrowRight aria-hidden="true" size={18} />
          </Button>
        </div>
      )}
      <div className="study-save">
        <ShieldCheck aria-hidden="true" size={14} />
        Tự lưu trên thiết bị khi trình duyệt cho phép.
      </div>
    </div>
  );
}
function Flashcard({
  question,
  flipped,
  attempt,
  onFlip,
  onRate,
}: {
  question: Extract<Question, { type: 'flashcard' }>;
  flipped: boolean;
  attempt?: Attempt;
  onFlip: () => void;
  onRate: (v: boolean) => void;
}) {
  const entry = primaryName(pack, question.speciesId, question.kind)!;
  return (
    <div className="flash-exercise">
      <div className="study-heading">
        <h1>Flashcard</h1>
        <span>{languageLabels[question.kind]}</span>
      </div>
      <section className={`flashcard ${flipped ? 'is-flipped' : ''}`}>
        <div className="flashcard-top">
          <span>{flipped ? languageLabels[question.kind] : 'Tiếng Việt'}</span>
          <span>
            {pack.species.find((s) => s.id === question.speciesId)?.tradeCategory} ·{' '}
            {flipped ? 'Mặt sau' : 'Mặt trước'}
          </span>
        </div>
        <div className="flashcard-center">
          {!flipped && <SpecimenImage speciesId={question.speciesId} className="flash-photo" />}
          <h2 className={flipped && question.kind === 'scientific' ? 'italic' : ''}>
            {flipped ? entry.label : titleFor(question.speciesId)}
          </h2>
          <p>
            {flipped
              ? entry.pronunciation?.text
              : `Tên ${languageLabels[question.kind].toLowerCase()} là gì?`}
          </p>
          {flipped && <AudioButton entry={entry} />}
        </div>
        <button className="flip-button" onClick={onFlip}>
          <RotateCcw aria-hidden="true" size={16} />
          {flipped ? 'Xem lại mặt trước' : 'Chạm để lật thẻ'}
          <ArrowDown aria-hidden="true" size={16} />
        </button>
      </section>
      {flipped && !attempt && (
        <div className="flash-rating">
          <span className="sr-only">Bạn tự đánh giá thế nào?</span>
          <div>
            <Button variant="secondary" onClick={() => onRate(false)}>
              <RotateCcw aria-hidden="true" size={17} />
              Chưa nhớ
            </Button>
            <Button onClick={() => onRate(true)}>
              <Check aria-hidden="true" size={18} />
              Đã nhớ
            </Button>
          </div>
          <small>Tự đánh giá · Không tính vào điểm đúng/sai</small>
        </div>
      )}
      {attempt && (
        <div className="feedback neutral" role="status">
          <CheckCheck aria-hidden="true" size={20} />
          <div>
            <strong>Đã lưu: {attempt.correct ? 'Đã nhớ' : 'Chưa nhớ'}</strong>
          </div>
        </div>
      )}
    </div>
  );
}
function MatchBoard({
  question,
  attempts,
  onAnswer,
}: {
  question: Extract<Question, { type: 'match' }>;
  attempts: Attempt[];
  onAnswer: (id: string, correct: boolean, answer: string) => void;
}) {
  const [selected, setSelected] = useState<{ side: 'left' | 'right'; id: string } | null>(null);
  const [feedback, setFeedback] = useState('');
  const matched = new Set(attempts.filter((a) => a.correct).map((a) => a.targetId));
  function select(side: 'left' | 'right', id: string) {
    if (matched.has(id)) return;
    if (!selected || selected.side === side) {
      setSelected(selected?.id === id && selected.side === side ? null : { side, id });
      return;
    }
    const left = side === 'left' ? id : selected.id;
    const right = side === 'right' ? id : selected.id;
    onAnswer(left, left === right, right);
    setFeedback(
      left === right
        ? `Chính xác! ${titleFor(left)} đã được ghép.`
        : 'Chưa đúng cặp. Hai thẻ đã bỏ chọn; hãy thử kết nối lại.',
    );
    setSelected(null);
  }
  return (
    <>
      <div className="study-heading">
        <Eyebrow>
          GHÉP TÊN · VIỆT → {languageLabels[question.kind].replace('Tiếng ', '').toUpperCase()}
        </Eyebrow>
        <h1>Đối chiếu tên thương mại</h1>
        <p>Chọn một thẻ ở mỗi cột để ghép. Dùng chạm, Tab và Enter đều được.</p>
      </div>
      <section className="match-panel">
        <div className="match-column-head">
          <span>TIẾNG VIỆT</span>
          <span>{languageLabels[question.kind].toUpperCase()}</span>
        </div>
        <div className="match-grid">
          {(['left', 'right'] as const).map((side) => (
            <div className="match-column" key={side}>
              {(side === 'left' ? question.pairs.map((p) => p.speciesId) : question.rightOrder).map(
                (id, i) => {
                  const pair = question.pairs.find((p) => p.speciesId === id)!;
                  return (
                    <button
                      key={id}
                      disabled={matched.has(id)}
                      aria-pressed={selected?.side === side && selected.id === id}
                      className={`match-tile ${matched.has(id) ? 'matched' : ''} ${selected?.side === side && selected.id === id ? 'selected' : ''} ${question.kind === 'scientific' && side === 'right' ? 'italic' : ''}`}
                      onClick={() => select(side, id)}
                    >
                      <span className="match-number">
                        {matched.has(id) ? (
                          <Check aria-hidden="true" size={16} />
                        ) : side === 'left' ? (
                          String(i + 1).padStart(2, '0')
                        ) : (
                          String.fromCharCode(65 + i)
                        )}
                      </span>
                      {pair[side]}
                    </button>
                  );
                },
              )}
            </div>
          ))}
        </div>
        <div className="match-status">
          <span>
            <Link2 aria-hidden="true" size={16} />
            {matched.size} / 3 cặp đã kết nối
          </span>
          <span>{attempts.filter((a) => !a.correct).length} lần thử chưa đúng</span>
        </div>
      </section>
      <div className={`match-feedback ${matched.size === 3 ? 'all-matched' : ''}`} role="status">
        {matched.size === 3 ? (
          <>
            <CheckCheck aria-hidden="true" size={20} />
            Tuyệt, bạn đã kết nối đủ 3 cặp!
          </>
        ) : (
          feedback || 'Chọn một thẻ để bắt đầu kết nối.'
        )}
      </div>
      <p className="fixture-caption">
        Bộ loài mẫu đã đối chiếu nguồn tên gọi, đang chờ duyệt chuyên môn; không phải danh mục của
        khách.
      </p>
    </>
  );
}
function HsQuestion({
  question,
  choice,
  followUp,
  attempt,
  onChange,
  onSubmit,
}: {
  question: Extract<Question, { type: 'hs' }>;
  choice?: string;
  followUp?: string;
  attempt?: Attempt;
  onChange: (v: { choice?: string; followUp?: string }) => void;
  onSubmit: (correct: boolean, answer: string) => void;
}) {
  const scenario = pack.scenarios.find((s) => s.id === question.scenarioId)!;
  const tariff = pack.tariffs.find((t) => t.id === scenario.tariffId)!;
  const checked = attempt ? attempt.answer.split('|')[0] : choice;
  const checkedFollowUp = attempt ? attempt.answer.split('|')[1] : followUp;
  const facts = [
    { key: 'frozen' as const, yes: 'Cấp đông', no: 'Không cấp đông', unknown: 'Chưa rõ bảo quản' },
    {
      key: 'filleted' as const,
      yes: 'Phi lê',
      no: 'Nguyên con',
      unknown: 'Chưa rõ dạng hàng',
    },
    {
      key: 'cooked' as const,
      yes: 'Đã nấu chín',
      no: 'Chưa nấu chín',
      unknown: 'Chưa rõ chế biến',
    },
    {
      key: 'smoked' as const,
      yes: 'Đã hun khói',
      no: 'Không hun khói',
      unknown: 'Chưa rõ hun khói',
    },
    {
      key: 'seasoned' as const,
      yes: 'Có tẩm ướp',
      no: 'Không tẩm ướp',
      unknown: 'Chưa rõ tẩm ướp',
    },
  ];
  const result = gradeHs(scenario, tariff, checked ?? '', checkedFollowUp);
  return (
    <>
      <div className="study-heading">
        <Eyebrow>HS theo dạng hàng · Hồ sơ mẫu</Eyebrow>
        <h1>{scenario.title}</h1>
        <p>Đọc kỹ mô tả. Đủ dữ kiện mới chọn mã.</p>
      </div>
      <div className="hs-disclaimer">
        <Flag aria-hidden="true" size={17} />
        <span>
          Bài nội bộ đối chiếu nguồn HS 2022, chưa duyệt nghiệp vụ/hiệu lực hiện hành. Không dùng để
          khai báo lô hàng thực tế.
        </span>
      </div>
      <section className="scenario-card">
        <div className="scenario-meta">
          <span>VIỆT NAM · CẤP {scenario.expectedCodeLength} SỐ</span>
          <span>{tariff.version}</span>
        </div>
        <p>{scenario.description}</p>
        <div className="fact-chips">
          {facts
            .filter((f) => scenario.facts[f.key] !== undefined)
            .map((f) => (
              <span className={scenario.facts[f.key] === 'unknown' ? 'unknown' : ''} key={f.key}>
                {scenario.facts[f.key] === 'unknown' ? (
                  <CircleHelp aria-hidden="true" size={13} />
                ) : (
                  <Check aria-hidden="true" size={13} />
                )}
                {scenario.facts[f.key] === 'unknown'
                  ? f.unknown
                  : scenario.facts[f.key]
                    ? f.yes
                    : f.no}
              </span>
            ))}
        </div>
      </section>
      <fieldset className="answer-options" disabled={!!attempt}>
        <legend>Chọn câu trả lời phù hợp</legend>
        {scenario.options.map((o, i) => (
          <label className={`answer-option ${checked === o.id ? 'chosen' : ''}`} key={o.id}>
            <input
              type="radio"
              name={question.id}
              value={o.id}
              checked={checked === o.id}
              onChange={() => onChange({ choice: o.id, followUp: undefined })}
            />
            <span className="answer-letter">{String.fromCharCode(65 + i)}</span>
            <span className={o.id !== 'insufficient' ? 'hs-code' : ''}>{o.label}</span>
            <span className="radio-indicator">{checked === o.id && <span />}</span>
          </label>
        ))}
      </fieldset>
      {checked === 'insufficient' && (
        <fieldset className="followup-options" disabled={!!attempt}>
          <legend>
            <CircleHelp aria-hidden="true" size={17} />
            Bước 2 · Bạn cần hỏi thêm điều gì?
          </legend>
          {scenario.followUps.map((f) => (
            <label key={f.id} className={checkedFollowUp === f.id ? 'chosen' : ''}>
              <input
                type="radio"
                name={`${question.id}-followup`}
                value={f.id}
                checked={checkedFollowUp === f.id}
                onChange={() => onChange({ followUp: f.id })}
              />
              {f.label}
            </label>
          ))}
        </fieldset>
      )}
      {!attempt ? (
        <div className="hs-submit">
          <Button
            disabled={!checked || result.needsFollowUp}
            onClick={() => onSubmit(result.correct, `${checked}|${checkedFollowUp ?? ''}`)}
          >
            Kiểm tra câu trả lời
            <ArrowRight aria-hidden="true" size={17} />
          </Button>
          {result.needsFollowUp && <span>Chọn chi tiết cần hỏi để hoàn tất câu trả lời.</span>}
        </div>
      ) : (
        <div className={`feedback ${attempt.correct ? 'correct' : 'incorrect'}`} role="status">
          {attempt.correct ? (
            <CheckCheck aria-hidden="true" size={23} />
          ) : (
            <CircleHelp aria-hidden="true" size={23} />
          )}
          <div>
            <strong>
              {attempt.correct
                ? 'Chính xác, bạn đã đọc đúng dữ kiện.'
                : 'Cùng nhìn lại dữ kiện quyết định.'}
            </strong>
            <p>{scenario.explanation}</p>
            <p className="choice-explanation">
              {scenario.options.find((o) => o.id === checked)?.explanation}
            </p>
            <details>
              <summary>Nguồn đối chiếu & giới hạn</summary>
              <p>
                {pack.sources.find((s) => s.id === tariff.sourceId)?.title} ·{' '}
                {pack.sources.find((s) => s.id === tariff.sourceId)?.location}
              </p>
              <p>{tariff.citation}</p>
              {pack.sources.find((s) => s.id === tariff.sourceId)?.url && (
                <a
                  href={pack.sources.find((s) => s.id === tariff.sourceId)?.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Mở nguồn đối chiếu
                </a>
              )}
              <p>
                Không có người duyệt hoặc ngày kiểm chứng hiệu lực. Phải đối chiếu văn bản thực tế
                trước khi phát hành.
              </p>
            </details>
          </div>
        </div>
      )}
    </>
  );
}
function Summary({
  state,
  onReview,
  onHome,
  onRetry,
  onRetrySkipped,
}: {
  state: AppState;
  onReview: () => void;
  onHome: () => void;
  onRetry: () => void;
  onRetrySkipped: () => void;
}) {
  const session = state.session!;
  const attempts = state.attempts.filter((a) => a.sessionId === session.id);
  const first = attempts.filter((a) => !a.skipped && !a.selfRated && a.attemptNumber === 1);
  const retry = attempts.filter((a) => !a.skipped && !a.selfRated && a.attemptNumber > 1);
  const self = attempts.filter((a) => !a.skipped && a.selfRated);
  const mistakes = retryCandidates(state).length > 0;
  const skipped = attempts.filter((a) => a.skipped);
  const answered = attempts.filter((a) => !a.skipped);
  return (
    <div className="summary-page">
      <span className="summary-symbol">
        <Flag aria-hidden="true" size={34} />
      </span>
      <Eyebrow>Kết quả lượt học</Eyebrow>
      <h1>
        {retryCandidates(state, true).length
          ? 'Lượt học kết thúc, có câu bỏ qua'
          : 'Bạn đã hoàn thành lượt học'}
        <span className="orange">.</span>
      </h1>
      <p>Xem kết quả theo kỹ năng và luyện lại các câu chưa đúng.</p>
      <div className="summary-stats">
        <div>
          <strong>
            {first.filter((a) => a.correct).length}
            <small> / {first.length}</small>
          </strong>
          <span>Đúng lần đầu · chấm tự động</span>
        </div>
        <div>
          <strong>
            {retry.filter((a) => a.correct).length}
            <small> / {retry.length}</small>
          </strong>
          <span>Đúng khi làm lại</span>
        </div>
        <div>
          <strong>
            {self.filter((a) => a.correct).length}
            <small> / {self.length}</small>
          </strong>
          <span>Flashcard · tự đánh giá đã nhớ</span>
        </div>
      </div>
      <p className="summary-answer-count" role="status">
        Đã trả lời {answered.length} lượt · Bỏ qua {skipped.length} câu
        {answered.length === 0 ? ' · Chưa có câu trả lời, không tính tỷ lệ.' : ''}
      </p>
      <section className="summary-breakdown">
        <h2>Nhìn lại từng kỹ năng</h2>
        {[...new Set(answered.map((a) => a.skill))].map((skill) => {
          const rows = answered.filter((a) => a.skill === skill);
          return (
            <div key={skill}>
              <span>{skillLabel(skill)}</span>
              <span>
                {rows.filter((a) => a.correct).length} / {rows.length}{' '}
                {rows[0].selfRated ? 'tự đánh giá đã nhớ' : 'lần trả lời đúng'}
              </span>
            </div>
          );
        })}
      </section>
      <div className="summary-note">
        <Sprout aria-hidden="true" size={25} />
        <div>
          <strong>
            {answered.length
              ? 'Lịch ôn đã được lên cho từng kỹ năng.'
              : 'Chưa tạo lịch ôn từ các câu bỏ qua.'}
          </strong>
          <p>Mục sai về mốc 1 ngày. Làm lại đúng trong lượt này không tăng bậc.</p>
        </div>
      </div>
      <div className="summary-actions">
        <Button onClick={onReview}>
          Xem hàng đợi ôn
          <ArrowRight aria-hidden="true" size={17} />
        </Button>
        {mistakes && (
          <Button variant="secondary" onClick={onRetry}>
            <RotateCcw aria-hidden="true" size={16} />
            Ôn lỗi ngay
          </Button>
        )}
        {retryCandidates(state, true).length > 0 && (
          <Button variant="secondary" onClick={onRetrySkipped}>
            Thử lại câu bỏ qua
          </Button>
        )}
        <Button variant="ghost" onClick={onHome}>
          Về góc học tập
        </Button>
      </div>
    </div>
  );
}
function AboutModal({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prior = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') {
        const items = ref.current?.querySelectorAll<HTMLElement>('button, a[href], [tabindex="0"]');
        if (!items?.length) return;
        const first = items[0],
          last = items[items.length - 1];
        if (
          e.shiftKey &&
          (document.activeElement === first || document.activeElement === ref.current)
        ) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('keydown', key);
      prior?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="about-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="about-title"
      tabIndex={-1}
      ref={ref}
      onClick={(e) => e.stopPropagation()}
    >
      <button className="modal-close" aria-label="Đóng giới thiệu" onClick={onClose}>
        <X size={20} />
      </button>
      <span className="brand-symbol">
        <Waves aria-hidden="true" size={25} />
      </span>
      <Eyebrow>Bản học thử nội bộ</Eyebrow>
      <h2 id="about-title">Học chuyên ngành thủy sản</h2>
      <p>
        Seafood Deck giúp người mới làm trong ngành thủy sản học bốn tên gọi và luyện đọc dữ kiện
        hàng hóa.
      </p>
      <div className="about-status">
        <LockKeyhole aria-hidden="true" size={19} />
        <span>Bộ public: {PUBLIC_CONTENT_ENABLED ? 'đang mở' : 'chưa mở'}</span>
      </div>
      <ul>
        <li>
          Tên gọi được đối chiếu nguồn; nội dung và tình huống mẫu chưa được duyệt chuyên môn. Không
          phải catalogue khách.
        </li>
        <li>Bộ mẫu có 6 loài, 5 ảnh thật ứng viên; chưa có audio và người duyệt nội dung.</li>
        <li>Mã HS minh họa chưa được xác nhận hiệu lực hiện hành.</li>
        <li>Tiến độ chỉ lưu trên trình duyệt này; không cần tài khoản.</li>
      </ul>
      <Button onClick={onClose}>
        Đã hiểu, tiếp tục khám phá
        <ArrowRight aria-hidden="true" size={16} />
      </Button>
    </div>
  );
}
