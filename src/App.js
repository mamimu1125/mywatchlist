import React, { useState, useEffect } from 'react';
import { Search, Plus, Heart, Trash2, Edit2, X, Film, Tv, Star, Clock, Shield, Lock } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from 'firebase/auth';

function App() {
  const [items, setItems] = useState([]);
  const [categories] = useState([
    { id: 'movie', name: '映画' },
    { id: 'tv', name: 'ドラマ・シリーズ' },
    { id: 'anime', name: 'アニメ' },
    { id: 'documentary', name: 'ドキュメンタリー' }
  ]);
  const [services] = useState([
    { id: 'netflix', name: 'Netflix' },
    { id: 'prime', name: 'Prime Video' },
    { id: 'disney', name: 'Disney+' },
    { id: 'hulu', name: 'Hulu' },
    { id: 'unext', name: 'U-NEXT' }
  ]);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedGenre, setSelectedGenre] = useState('all');
  const [selectedStarFilter, setSelectedStarFilter] = useState('all');
  const [sortBy, setSortBy] = useState('year');
  const [showAddForm, setShowAddForm] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showGenres, setShowGenres] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  
  // 管理者権限チェック用のstate
  const [isAdmin, setIsAdmin] = useState(false);

  // Firebase設定
  const firebaseConfig = {
    apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
    authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
    storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.REACT_APP_FIREBASE_APP_ID
  };

  // 管理者のメールアドレス（ハッシュ化されたものと比較する方法も可能）
  const ADMIN_EMAIL = process.env.REACT_APP_ADMIN_EMAIL;
  const TMDB_API_KEY = process.env.REACT_APP_TMDB_API_KEY;

  // より安全な管理者チェック（オプション）
  const checkAdminStatus = (email) => {
    // 実際のメールアドレスを直接比較する代わりに、
    // ハッシュ化された値と比較することも可能
    return email === ADMIN_EMAIL;
  };

  const [newItem, setNewItem] = useState({
    title: '',
    type: 'movie',
    category: 'movie',
    rating: 0,
    comment: '',
    favorite: false,
    overview: '',
    releaseDate: '',
    genres: [],
    poster: '',
    tmdbRating: 0,
    tmdbVoteCount: 0,
    runtime: null,
    numberOfSeasons: null,
    cast: []
  });

  const [showSearchResults, setShowSearchResults] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Firebase初期化
  useEffect(() => {
    const initFirebase = async () => {
      try {
        const app = initializeApp(firebaseConfig);
        const firestore = getFirestore(app);
        const authentication = getAuth(app);

        setDb(firestore);
        setAuth(authentication);

        // 認証状態の監視
        onAuthStateChanged(authentication, async (user) => {
          if (user) {
            // 管理者権限チェック
            const isUserAdmin = checkAdminStatus(user.email);
            
            if (!isUserAdmin) {
              // 管理者以外は自動ログアウト
              await signOut(authentication);
              setUser(null);
              setIsAdmin(false);
              loadData(firestore);
              return;
            }
            
            setUser(user);
            setIsAdmin(true);
            loadData(firestore);
          } else {
            setUser(null);
            setIsAdmin(false);
            loadData(firestore); // 未ログインでも閲覧可能
          }
        });
      } catch (error) {
        console.error('Firebase初期化エラー:', error);
      }
    };

    initFirebase();
  }, []);

  // Firebaseからデータ読み込み
  const loadData = async (firestore) => {
    try {
      setIsLoading(true);
      const videosSnapshot = await getDocs(collection(firestore, 'watchlist'));
      const firebaseItems = videosSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setItems(firebaseItems);
    } catch (error) {
      console.error('データ読み込みエラー:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // ログイン関連の関数
  const handleLogin = async () => {
    if (auth) {
      try {
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({
          prompt: 'select_account'
        });
        await signInWithPopup(auth, provider);
        
      } catch (error) {
        console.error('ログインエラー:', error);
        if (error.code !== 'auth/popup-closed-by-user') {
          alert('ログインに失敗しました');
        }
      }
    }
  };

  const handleLogout = async () => {
    if (auth) {
      try {
        await signOut(auth);
      } catch (error) {
        console.error('ログアウトエラー:', error);
      }
    }
  };

  const getGenreName = (genreIds) => {
    const genreMap = {
      28: 'アクション', 12: 'アドベンチャー', 16: 'アニメーション',
      35: 'コメディ', 80: 'クライム', 99: 'ドキュメンタリー',
      18: 'ドラマ', 10751: 'ファミリー', 14: 'ファンタジー',
      36: '歴史', 27: 'ホラー', 10402: '音楽', 9648: 'ミステリー',
      10749: 'ロマンス', 878: 'SF', 53: 'スリラー'
    };
    return genreIds?.map(id => genreMap[id]).filter(Boolean) || [];
  };

  // ジャンル一覧を取得（登録された作品から）
  const getAvailableGenres = () => {
    const allGenres = new Set();
    items.forEach(item => {
      if (item.genres && item.genres.length > 0) {
        item.genres.forEach(genre => allGenres.add(genre));
      }
    });
    return Array.from(allGenres).sort();
  };

  // TMDb API関数（実際版）
  const searchTMDbContent = async (query) => {
    if (!TMDB_API_KEY) {
      console.warn('TMDb API Key not found. Using mock data.');
      return mockSearchResults(query);
    }

    try {
      const response = await fetch(
        `https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&language=ja-JP&page=1`
      );
      
      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const data = await response.json();
      console.log('TMDb API Response:', data);
      
      const filteredResults = (data.results || []).filter(item => 
        item.media_type === 'movie' || item.media_type === 'tv'
      );
      
      // 各結果の詳細情報を取得（runtime等）
      const detailedResults = await Promise.all(
        filteredResults.slice(0, 10).map(async (item) => {
          try {
            const detailResponse = await fetch(
              `https://api.themoviedb.org/3/${item.media_type}/${item.id}?api_key=${TMDB_API_KEY}&language=ja-JP`
            );
            
            const creditsResponse = await fetch(
              `https://api.themoviedb.org/3/${item.media_type}/${item.id}/credits?api_key=${TMDB_API_KEY}`
            );
            
            if (detailResponse.ok && creditsResponse.ok) {
              const detail = await detailResponse.json();
              const credits = await creditsResponse.json();
              
              // 主要キャスト3名を取得
              const mainCast = (credits.cast || []).slice(0, 3).map(actor => ({
                name: actor.name,
                character: actor.character,
                profile_path: actor.profile_path
              }));
              
              return {
                ...item,
                runtime: detail.runtime || null,
                number_of_seasons: detail.number_of_seasons || null,
                cast: mainCast
              };
            }
          } catch (error) {
            console.error('Detail fetch error:', error);
          }
          return { ...item, cast: [] };
        })
      );
      
      return detailedResults;
    } catch (error) {
      console.error('TMDb API error:', error);
      return mockSearchResults(query);
    }
  };

  // モック検索結果（APIキーがない場合のフォールバック）
  const mockSearchResults = (query) => {
    console.log('Using mock search results for:', query);
    return [
      {
        id: Date.now() + 1,
        title: `${query}`,
        media_type: 'movie',
        overview: `${query} - 素晴らしい映画です。感動的なストーリーと優れた演技で多くの人に愛されています。`,
        release_date: '2024-01-15',
        genre_ids: [28, 12, 18],
        poster_path: null
      },
      {
        id: Date.now() + 2,
        name: `${query} シリーズ`,
        media_type: 'tv',
        overview: `${query}のドラマシリーズ。原作を忠実に再現した話題作で、シーズンを重ねるごとに面白くなります。`,
        first_air_date: '2024-03-01',
        genre_ids: [35, 18, 10759],
        poster_path: null
      },
      {
        id: Date.now() + 3,
        title: `${query} 2`,
        media_type: 'movie',
        overview: `${query}の続編。前作を上回るスケールとアクションで、ファン期待の作品です。`,
        release_date: '2024-07-20',
        genre_ids: [28, 878, 12],
        poster_path: null
      }
    ];
  };

  const handleSearch = async () => {
    if (!searchQuery.trim() || !isAdmin) return;
    
    setIsLoading(true);
    setShowSearchResults(false);
    
    try {
      console.log('Searching for:', searchQuery);
      const results = await searchTMDbContent(searchQuery);
      console.log('Search results:', results);
      
      setSearchResults(results);
      setShowSearchResults(true);
    } catch (error) {
      console.error('検索エラー:', error);
      alert('検索に失敗しました');
    } finally {
      setIsLoading(false);
    }
  };

  const selectFromSearch = (result) => {
    if (!isAdmin) return;
    
    const isMovie = result.media_type === 'movie';
    const posterUrl = result.poster_path 
      ? `https://image.tmdb.org/t/p/w500${result.poster_path}` 
      : `https://picsum.photos/300/450?random=${result.id}`;
    
    setNewItem({
      ...newItem,
      title: result.title || result.name,
      type: isMovie ? 'movie' : 'tv',
      category: isMovie ? 'movie' : 'tv',
      overview: result.overview,
      releaseDate: result.release_date || result.first_air_date,
      genres: getGenreName(result.genre_ids),
      poster: posterUrl,
      tmdbRating: result.vote_average || 0,
      tmdbVoteCount: result.vote_count || 0,
      runtime: result.runtime || null,
      numberOfSeasons: result.number_of_seasons || null,
      cast: result.cast || []
    });
    setShowSearchResults(false);
    setSearchQuery('');
  };

  // フィルタリング＆ソート
  const filteredAndSortedItems = (() => {
    // フィルタリング
    const filtered = items.filter(item => {
      const matchesSearch = item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           item.overview.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           item.comment.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory;
      const matchesGenre = selectedGenre === 'all' || (item.genres && item.genres.includes(selectedGenre));
      const matchesStarFilter = selectedStarFilter === 'all' || item.rating === selectedStarFilter;
      return matchesSearch && matchesCategory && matchesGenre && matchesStarFilter;
    });

    // ソート
    const sorted = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'rating':
          // 評価順（高い順、0は最後）
          if (a.rating === 0 && b.rating === 0) return 0;
          if (a.rating === 0) return 1;
          if (b.rating === 0) return -1;
          return b.rating - a.rating;
        case 'favorite':
          // お気に入り順（お気に入り → 通常）
          if (a.favorite && !b.favorite) return -1;
          if (!a.favorite && b.favorite) return 1;
          // お気に入り同士、または通常同士の場合は評価順
          return b.rating - a.rating;
        case 'year':
          // 年代順（新しい順）
          const yearA = a.releaseDate ? new Date(a.releaseDate).getFullYear() : 0;
          const yearB = b.releaseDate ? new Date(b.releaseDate).getFullYear() : 0;
          if (yearA === 0 && yearB === 0) return 0;
          if (yearA === 0) return 1;
          if (yearB === 0) return -1;
          return yearB - yearA;
        case 'tmdb':
          // TMDb評価順（高い順、0は最後）
          if (a.tmdbRating === 0 && b.tmdbRating === 0) return 0;
          if (a.tmdbRating === 0) return 1;
          if (b.tmdbRating === 0) return -1;
          return b.tmdbRating - a.tmdbRating;
        case 'added':
        default:
          // 追加順（新しい順）
          return new Date(b.addedDate) - new Date(a.addedDate);
      }
    });

    return sorted;
  })();

  // 作品追加（管理者のみ）
  const handleAddItem = async () => {
    if (!isAdmin || !newItem.title || !db) return;
    
    try {
      await addDoc(collection(db, 'watchlist'), {
        ...newItem,
        addedDate: new Date().toISOString()
      });
      loadData(db);
      resetForm();
    } catch (error) {
      console.error('作品追加エラー:', error);
      alert('作品の追加に失敗しました');
    }
  };

  // 作品更新（管理者のみ）
  const handleUpdateItem = async () => {
    if (!isAdmin || !editingId || !db) return;
    
    try {
      await updateDoc(doc(db, 'watchlist', editingId), newItem);
      loadData(db);
      resetForm();
    } catch (error) {
      console.error('作品更新エラー:', error);
      alert('作品の更新に失敗しました');
    }
  };

  // 作品削除（管理者のみ）
  const handleDeleteItem = async (id) => {
    if (!isAdmin || !db) return;
    
    if (window.confirm('この作品を削除しますか？')) {
      try {
        await deleteDoc(doc(db, 'watchlist', id));
        loadData(db);
      } catch (error) {
        console.error('作品削除エラー:', error);
        alert('作品の削除に失敗しました');
      }
    }
  };

  // フォームリセット
  const resetForm = () => {
    setNewItem({
      title: '',
      type: 'movie',
      category: 'movie',
      rating: 0,
      comment: '',
      favorite: false,
      overview: '',
      releaseDate: '',
      genres: [],
      poster: '',
      tmdbRating: 0,
      tmdbVoteCount: 0,
      runtime: null,
      numberOfSeasons: null,
      cast: []
    });
    setShowAddForm(false);
    setEditingId(null);
    setShowSearchResults(false);
    setSearchQuery('');
  };

  // お気に入り切り替え（管理者のみ）
  const toggleFavorite = async (id) => {
    if (!isAdmin) return;
    
    const item = items.find(v => v.id === id);
    if (item && db) {
      try {
        await updateDoc(doc(db, 'watchlist', id), { favorite: !item.favorite });
        loadData(db);
      } catch (error) {
        console.error('お気に入り更新エラー:', error);
      }
    }
  };

  // ステータス変更（管理者のみ）
  const changeStatus = async (id, status) => {
    if (!isAdmin || !db) return;
    
    try {
      await updateDoc(doc(db, 'watchlist', id), { status });
      loadData(db);
    } catch (error) {
      console.error('ステータス更新エラー:', error);
    }
  };

  // 編集開始（管理者のみ）
  const handleEditItem = (id) => {
    if (!isAdmin) return;
    
    const item = items.find(i => i.id === id);
    if (item) {
      setNewItem(item);
      setEditingId(id);
      setShowAddForm(true);
    }
  };

  // 詳細モーダル
  const openItemModal = (item) => {
    setSelectedItem(item);
  };

  const closeItemModal = () => {
    setSelectedItem(null);
  };

  // 星評価コンポーネント
  const StarRating = ({ rating, onRatingChange, readonly = false }) => {
    return (
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map(star => (
          <button
            key={star}
            type="button"
            onClick={() => !readonly && onRatingChange && isAdmin && onRatingChange(star)}
            className={`${readonly || !isAdmin ? 'cursor-default' : 'cursor-pointer hover:scale-110'} transition-transform`}
            disabled={readonly || !isAdmin}
          >
            <Star 
              className={`w-5 h-5 ${
                star <= rating 
                  ? 'text-yellow-500 fill-current' 
                  : 'text-gray-300'
              }`} 
            />
          </button>
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 text-black">
      {/* ヘッダー */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <Film className="w-6 h-6 text-red-600 mr-2" />
              <h1 className="text-xl font-bold">MyWatchList</h1>
            </div>
            <div className="flex items-center gap-2">
              {user && (
                <div className="flex items-center gap-3">
                  <div className="text-sm text-gray-600">
                    {user.displayName || user.email}
                  </div>
                  <button
                    onClick={handleLogout}
                    className="px-3 py-1 text-sm border border-gray-300 rounded hover:border-red-500 hover:text-red-600"
                  >
                    ログアウト
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* 権限表示 */}
        {!isAdmin && user && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center gap-2 text-blue-800">
              <Lock className="w-4 h-4" />
              <span className="text-sm">閲覧専用モードです。編集・追加機能は管理者のみ利用できます。</span>
            </div>
          </div>
        )}

        {/* 検索バー（折りたたみ式） */}
        {showSearch && (
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="作品を検索..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-100"
                autoFocus
              />
            </div>
          </div>
        )}

        {/* ジャンル・星評価（PC用横並び、スマホ用縦並び） */}
        <div className="mb-4">
          <div className="flex flex-col lg:flex-row lg:items-center lg:gap-4">
            {/* ジャンルタブ（折りたたみ式） */}
            <div className="mb-4 lg:mb-0">
              <button
                onClick={() => setShowGenres(!showGenres)}
                className={`flex items-center gap-2 px-4 py-3 lg:px-3 lg:py-2 text-base lg:text-sm rounded-lg transition-colors ${
                  showGenres 
                    ? 'bg-red-600 text-white' 
                    : 'bg-white text-gray-700 border border-gray-300 hover:border-red-500'
                }`}
              >
                ジャンル ({selectedGenre === 'all' ? 'すべて' : selectedGenre})
                <span className={`transform transition-transform ${showGenres ? 'rotate-180' : ''}`}>
                  ▼
                </span>
              </button>
              
              {showGenres && (
                <div className="absolute z-10 mt-2 p-3 bg-white border border-gray-200 rounded-lg shadow-lg max-w-md">
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => {
                        setSelectedGenre('all');
                        setShowGenres(false);
                      }}
                      className={`px-4 py-2 text-sm rounded-full transition-colors ${
                        selectedGenre === 'all'
                          ? 'bg-red-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-red-100'
                      }`}
                    >
                      すべて ({items.length})
                    </button>
                    {getAvailableGenres().map(genre => {
                      const count = items.filter(item => item.genres && item.genres.includes(genre)).length;
                      return (
                        <button
                          key={genre}
                          onClick={() => {
                            setSelectedGenre(genre);
                            setShowGenres(false);
                          }}
                          className={`px-4 py-2 text-sm rounded-full transition-colors ${
                            selectedGenre === genre
                              ? 'bg-red-600 text-white'
                              : 'bg-gray-100 text-gray-700 hover:bg-red-100'
                          }`}
                        >
                          {genre} ({count})
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* 星評価フィルター */}
            <div className="flex-1">
              <div className="grid grid-cols-3 sm:flex sm:flex-wrap gap-1 sm:gap-2">
                <button
                  onClick={() => setSelectedStarFilter('all')}
                  className={`flex items-center justify-center gap-1 px-2 py-2 sm:px-3 sm:py-1 text-xs sm:text-sm rounded-full transition-colors ${
                    selectedStarFilter === 'all'
                      ? 'bg-yellow-500 text-white'
                      : 'bg-white text-gray-700 border border-gray-300 hover:border-yellow-500'
                  }`}
                >
                  <Star className="w-3 h-3 fill-current" />
                  すべて
                </button>
                {[5, 4, 3, 2, 1].map(star => {
                  return (
                    <button
                      key={star}
                      onClick={() => setSelectedStarFilter(star)}
                      className={`flex items-center justify-center gap-1 px-2 py-2 sm:px-3 sm:py-1 text-xs sm:text-sm rounded-full transition-colors ${
                        selectedStarFilter === star
                          ? 'bg-yellow-500 text-white'
                          : 'bg-white text-gray-700 border border-gray-300 hover:border-yellow-500'
                      }`}
                    >
                      <Star className="w-3 h-3 fill-current" />
                      {star}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* コンパクトフィルター */}
        <div className="mb-4 sm:mb-6">
          {/* スマホ: 検索1カラム + 選択2カラム, PC: 横並び */}
          <div className="block sm:hidden">
            {/* 検索ボタンは削除（下の3カラムに統合） */}

            {/* 選択項目（2カラム → 3つを均等幅に） */}
            <div className="grid grid-cols-3 gap-2 mb-3">
              <button
                onClick={() => setShowSearch(!showSearch)}
                className={`flex items-center justify-center py-3 text-sm rounded transition-colors ${
                  showSearch 
                    ? 'bg-red-600 text-white' 
                    : 'border border-gray-300 text-gray-700 hover:border-red-500'
                }`}
              >
                <Search className="w-4 h-4 mr-1" />
                検索
              </button>

              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="px-2 py-3 text-sm border border-gray-300 rounded focus:outline-none focus:border-red-500"
              >
                <option value="all">すべて</option>
                {categories.map(category => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="px-2 py-3 text-sm border border-gray-300 rounded focus:outline-none focus:border-red-500"
              >
                <option value="year">年代順</option>
                <option value="added">追加順</option>
                <option value="rating">評価順</option>
                <option value="favorite">お気に入り順</option>
                <option value="tmdb">IMDb評価順</option>
              </select>
            </div>
          </div>

          {/* PC用レイアウト */}
          <div className="hidden sm:flex sm:flex-row sm:gap-3 sm:items-center">
            <button
              onClick={() => setShowSearch(!showSearch)}
              className={`flex items-center justify-center px-3 py-1 text-xs rounded transition-colors ${
                showSearch 
                  ? 'bg-red-600 text-white' 
                  : 'border border-gray-300 text-gray-700 hover:border-red-500'
              }`}
            >
              <Search className="w-3 h-3 mr-1" />
              検索
            </button>

            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-3 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:border-red-500"
            >
              <option value="all">すべてのカテゴリ</option>
              {categories.map(category => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </select>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-3 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:border-red-500"
            >
              <option value="year">年代順</option>
              <option value="added">追加順</option>
              <option value="rating">評価順</option>
              <option value="favorite">お気に入り順</option>
              <option value="tmdb">IMDb評価順</option>
            </select>
          </div>
          
          {/* 作品追加ボタン（スマホでは下段、PCでは右端） */}
          {isAdmin && (
            <div className="sm:hidden">
              <button
                onClick={() => setShowAddForm(true)}
                className="w-full flex items-center justify-center px-4 py-3 bg-red-600 text-white text-sm rounded hover:bg-red-700 shadow-sm"
              >
                <Plus className="w-4 h-4 mr-2" />
                作品追加
              </button>
            </div>
          )}
          
          {/* PC用の作品追加ボタン */}
          <div className="hidden sm:flex sm:justify-end sm:mt-3">
            {isAdmin && (
              <button
                onClick={() => setShowAddForm(true)}
                className="flex items-center justify-center px-3 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700 shadow-sm"
              >
                <Plus className="w-3 h-3 mr-1" />
                作品追加
              </button>
            )}
          </div>
        </div>

        {/* 作品追加/編集フォーム（管理者のみ） */}
        {showAddForm && isAdmin && (
          <div className="mb-6 p-6 bg-white border border-gray-300 rounded-lg shadow-sm">
            <h3 className="text-lg font-semibold mb-4">
              {editingId ? '作品編集' : '作品追加'}
            </h3>
            
            {/* 作品検索 */}
            {!editingId && (
              <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                <h4 className="font-medium mb-2">作品検索（TMDb）</h4>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="作品名を入力して検索..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-red-500"
                  />
                  <button
                    onClick={handleSearch}
                    disabled={isLoading}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                  >
                    {isLoading ? '検索中...' : '検索'}
                  </button>
                </div>
              </div>
            )}

            {/* 検索結果 */}
            {showSearchResults && (
              <div className="mb-4 max-h-64 overflow-y-auto border border-gray-200 rounded">
                {searchResults.length > 0 ? (
                  searchResults.map(result => (
                    <div key={result.id} className="p-3 border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                         onClick={() => selectFromSearch(result)}>
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-16 bg-gray-200 rounded flex items-center justify-center overflow-hidden">
                          {result.poster_path ? (
                            <img 
                              src={`https://image.tmdb.org/t/p/w92${result.poster_path}`}
                              alt={result.title || result.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            result.media_type === 'movie' ? <Film className="w-6 h-6" /> : <Tv className="w-6 h-6" />
                          )}
                        </div>
                        <div className="flex-1">
                          <h4 className="font-medium">{result.title || result.name}</h4>
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <span>{result.media_type === 'movie' ? '映画' : 'TV'}</span>
                            <span>•</span>
                            <span>{result.release_date || result.first_air_date || '不明'}</span>
                          </div>
                          <p className="text-xs text-gray-500 line-clamp-2 mt-1">{result.overview || '説明なし'}</p>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-3 text-center text-gray-500">
                    検索結果が見つかりませんでした
                  </div>
                )}
              </div>
            )}

            <div className="space-y-4">
              {(newItem.overview || newItem.poster) && (
                <div className="flex gap-4">
                  <div className="w-24 h-36 bg-gray-200 rounded overflow-hidden">
                    {newItem.poster ? (
                      <img
                        src={newItem.poster}
                        alt={newItem.title}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.target.style.display = 'none';
                          e.target.nextSibling.style.display = 'flex';
                        }}
                      />
                    ) : null}
                    <div className={`w-full h-full bg-gradient-to-br from-red-400 to-red-600 flex items-center justify-center text-white ${newItem.poster ? 'hidden' : 'flex'}`}>
                      {newItem.type === 'movie' ? <Film className="w-8 h-8" /> : <Tv className="w-8 h-8" />}
                    </div>
                  </div>
                  <div className="flex-1">
                    <h4 className="font-medium text-lg">{newItem.title}</h4>
                    <p className="text-sm text-gray-600 mb-2">{newItem.releaseDate}</p>
                    {newItem.genres.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {newItem.genres.map(genre => (
                          <span key={genre} className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                            {genre}
                          </span>
                        ))}
                      </div>
                    )}
                    {newItem.overview && (
                      <p className="text-sm text-gray-700 line-clamp-3">{newItem.overview}</p>
                    )}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">タイトル</label>
                  <input
                    type="text"
                    placeholder="作品タイトル"
                    value={newItem.title}
                    onChange={(e) => setNewItem({...newItem, title: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-red-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">カテゴリ</label>
                  <select
                    value={newItem.category}
                    onChange={(e) => setNewItem({...newItem, category: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-red-500"
                  >
                    {categories.map(category => (
                      <option key={category.id} value={category.id}>{category.name}</option>
                    ))}
                  </select>
                </div>

                <div></div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">評価</label>
                <StarRating 
                  rating={newItem.rating} 
                  onRatingChange={(rating) => setNewItem({...newItem, rating})} 
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">コメント</label>
                <textarea
                  placeholder="感想やメモ"
                  value={newItem.comment}
                  onChange={(e) => setNewItem({...newItem, comment: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-red-500 resize-none"
                  rows="3"
                />
              </div>

              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={newItem.favorite}
                  onChange={(e) => setNewItem({...newItem, favorite: e.target.checked})}
                  className="mr-2 rounded"
                />
                <span className="text-sm">お気に入り</span>
              </label>

              <div className="flex gap-2">
                <button
                  onClick={editingId ? handleUpdateItem : handleAddItem}
                  className="px-6 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                >
                  {editingId ? '更新' : '追加'}
                </button>
                <button
                  onClick={resetForm}
                  className="px-6 py-2 border border-gray-300 rounded hover:border-black"
                >
                  キャンセル
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 作品一覧 */}
        {isLoading ? (
          <div className="flex justify-center items-center py-20">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
              <p className="text-gray-500">読み込み中...</p>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {filteredAndSortedItems.map(item => {
              return (
                <div key={item.id} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
                  <div className="relative">
                    {item.poster ? (
                      <img
                        src={item.poster}
                        alt={item.title}
                        className="w-full h-48 sm:h-56 lg:h-64 object-cover cursor-pointer"
                        onClick={() => openItemModal(item)}
                        onError={(e) => {
                          e.target.style.display = 'none';
                          e.target.nextSibling.style.display = 'flex';
                        }}
                      />
                    ) : null}
                    <div 
                      className={`w-full h-48 sm:h-56 lg:h-64 bg-gradient-to-br from-red-400 to-red-600 flex items-center justify-center text-white cursor-pointer ${item.poster ? 'hidden' : 'flex'}`}
                      onClick={() => openItemModal(item)}
                    >
                      {item.type === 'movie' ? <Film className="w-12 h-12 sm:w-14 sm:h-14" /> : <Tv className="w-12 h-12 sm:w-14 sm:h-14" />}
                    </div>
                    
                    {item.favorite && (
                      <Heart className="absolute top-2 left-2 w-4 h-4 sm:w-5 sm:h-5 text-red-500 fill-current" />
                    )}
                    
                    <div className="absolute bottom-2 left-2 px-2 py-1 bg-black bg-opacity-70 text-white text-xs rounded flex items-center">
                      {item.type === 'movie' ? (
                        <>
                          <Film className="w-3 h-3" />
                          <span className="hidden sm:inline ml-1">映画</span>
                        </>
                      ) : (
                        <>
                          <Tv className="w-3 h-3" />
                          <span className="hidden sm:inline ml-1">ドラマ</span>
                        </>
                      )}
                    </div>
                  </div>
                  
                  <div className="p-2 sm:p-3">
                    <h3 className="font-semibold text-sm sm:text-base mb-1 line-clamp-2">{item.title}</h3>
                    
                    <div className="flex items-center justify-between text-xs mb-1 sm:mb-2">
                      <div className="flex items-center gap-2 text-gray-500">
                        {item.releaseDate && (
                          <span>{new Date(item.releaseDate).getFullYear()}</span>
                        )}
                        {item.tmdbRating > 0 && (
                          <div className="flex items-center gap-1">
                            <Star className="w-3 h-3 text-yellow-500 fill-current" />
                            <span>{item.tmdbRating.toFixed(1)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {(item.runtime || item.numberOfSeasons) && (
                      <p className="text-xs text-gray-500 mb-1 sm:mb-2">
                        {item.type === 'movie' && item.runtime ? `${item.runtime}分` : ''}
                        {item.type === 'tv' && item.numberOfSeasons ? `${item.numberOfSeasons}シーズン` : ''}
                      </p>
                    )}
                    
                    {item.rating > 0 && (
                      <div className="mb-1 sm:mb-2 scale-75 sm:scale-90 origin-left">
                        <StarRating rating={item.rating} readonly />
                      </div>
                    )}
                    
                    {item.comment && (
                      <p className="text-gray-500 text-xs mb-1 sm:mb-2 line-clamp-2">{item.comment}</p>
                    )}
                    
                    <div className="flex items-center justify-between">
                      <span className="hidden sm:inline-block bg-gray-100 text-gray-700 text-xs px-1 sm:px-2 py-1 rounded-full">
                        {categories.find(c => c.id === item.category)?.name}
                      </span>
                      
                      <div className="flex gap-1 sm:ml-auto">
                        {isAdmin && (
                          <>
                            <button
                              onClick={() => toggleFavorite(item.id)}
                              className="p-1 hover:bg-gray-100 rounded"
                              title="お気に入り"
                            >
                              <Heart className={`w-3 h-3 ${item.favorite ? 'fill-current text-red-500' : 'text-gray-400'}`} />
                            </button>
                            
                            <button
                              onClick={() => handleEditItem(item.id)}
                              className="p-1 hover:bg-gray-100 rounded"
                              title="編集"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                            
                            <button
                              onClick={() => handleDeleteItem(item.id)}
                              className="p-1 hover:bg-gray-100 rounded text-red-500"
                              title="削除"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {filteredAndSortedItems.length === 0 && !isLoading && (
          <div className="text-center py-12">
            <Film className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500 text-lg">作品が見つかりません</p>
            {isAdmin && (
              <button
                onClick={() => setShowAddForm(true)}
                className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                最初の作品を追加
              </button>
            )}
            {!user && (
              <p className="mt-4 text-gray-500 text-sm">
                作品を追加するには
                <button 
                  onClick={handleLogin}
                  className="text-red-600 hover:text-red-700 underline ml-1"
                >
                  ログイン
                </button>
                してください
              </p>
            )}
          </div>
        )}
      </div>

      {/* フッター（管理者ログイン） */}
      {!user && (
        <div className="fixed bottom-4 right-4">
          <button
            onClick={handleLogin}
            className="px-3 py-1 text-xs bg-gray-500 text-white rounded opacity-50 hover:opacity-100 transition-opacity"
          >
            管理者ログイン
          </button>
        </div>
      )}

      {/* 詳細モーダル */}
      {selectedItem && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-full overflow-y-auto">
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <h3 className="text-xl font-bold pr-4">{selectedItem.title}</h3>
                <button
                  onClick={closeItemModal}
                  className="p-2 hover:bg-gray-100 rounded"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="flex gap-4 mb-4">
                {selectedItem.poster ? (
                  <img
                    src={selectedItem.poster}
                    alt={selectedItem.title}
                    className="w-32 h-48 object-cover rounded"
                    onError={(e) => {
                      e.target.style.display = 'none';
                      e.target.nextSibling.style.display = 'flex';
                    }}
                  />
                ) : null}
                <div className={`w-32 h-48 bg-gradient-to-br from-red-400 to-red-600 rounded flex items-center justify-center text-white ${selectedItem.poster ? 'hidden' : 'flex'}`}>
                  {selectedItem.type === 'movie' ? <Film className="w-12 h-12" /> : <Tv className="w-12 h-12" />}
                </div>
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-3 mb-3 text-sm text-gray-500">
                    {selectedItem.releaseDate && (
                      <span>{new Date(selectedItem.releaseDate).getFullYear()}年</span>
                    )}
                    {selectedItem.tmdbRating > 0 && (
                      <div className="flex items-center gap-1">
                        <Star className="w-4 h-4 text-yellow-500 fill-current" />
                        <span>{selectedItem.tmdbRating.toFixed(1)} ({selectedItem.tmdbVoteCount}票)</span>
                      </div>
                    )}
                    {selectedItem.type === 'movie' && selectedItem.runtime && (
                      <span>{selectedItem.runtime}分</span>
                    )}
                    {selectedItem.type === 'tv' && selectedItem.numberOfSeasons && (
                      <span>{selectedItem.numberOfSeasons}シーズン</span>
                    )}
                  </div>
                  
                  {selectedItem.genres && selectedItem.genres.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {selectedItem.genres.map(genre => (
                        <span key={genre} className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                          {genre}
                        </span>
                      ))}
                    </div>
                  )}
                  
                  {selectedItem.cast && selectedItem.cast.length > 0 && (
                    <div className="mb-3">
                      <div className="text-sm text-gray-600 mb-2">出演者</div>
                      <div className="flex flex-wrap gap-2">
                        {selectedItem.cast.map((actor, index) => (
                          <div key={index} className="flex items-center gap-2 bg-gray-50 rounded-lg p-2 text-xs">
                            {actor.profile_path ? (
                              <img
                                src={`https://image.tmdb.org/t/p/w45${actor.profile_path}`}
                                alt={actor.name}
                                className="w-8 h-8 rounded-full object-cover"
                                onError={(e) => {
                                  e.target.style.display = 'none';
                                  e.target.nextSibling.style.display = 'flex';
                                }}
                              />
                            ) : null}
                            <div className={`w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center text-gray-600 text-xs ${actor.profile_path ? 'hidden' : 'flex'}`}>
                              {actor.name.charAt(0)}
                            </div>
                            <div>
                              <div className="font-medium text-gray-800">{actor.name}</div>
                              {actor.character && (
                                <div className="text-gray-500">({actor.character})</div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {selectedItem.rating > 0 && (
                    <div className="mb-3">
                      <div className="text-sm text-gray-600 mb-1">評価</div>
                      <StarRating rating={selectedItem.rating} readonly />
                    </div>
                  )}
                </div>
              </div>
              
              {selectedItem.overview && (
                <div className="mb-4">
                  <h4 className="font-medium mb-2 text-gray-800">あらすじ</h4>
                  <div className="bg-gray-50 p-3 rounded border-l-4 border-gray-300">
                    <p className="text-gray-700 text-sm leading-relaxed">{selectedItem.overview}</p>
                  </div>
                </div>
              )}
              
              {selectedItem.comment && (
                <div className="mb-4">
                  <h4 className="font-medium mb-2 text-gray-800">コメント</h4>
                  <div className="bg-blue-50 p-3 rounded border-l-4 border-blue-300">
                    <p className="text-gray-700 text-sm leading-relaxed">{selectedItem.comment}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;