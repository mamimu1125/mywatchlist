// src/App.js
import React, { useState, useEffect } from 'react';
import { Search, Plus, Heart, Trash2, Edit2, X, Play, ExternalLink, Video } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from 'firebase/auth';

// Firebase設定
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID
};

function App() {
  const [videos, setVideos] = useState([]);
  const [categories, setCategories] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [showAddForm, setShowAddForm] = useState(false);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // 管理者のメールアドレス
  const ADMIN_EMAIL = process.env.REACT_APP_ADMIN_EMAIL;
  const YOUTUBE_API_KEY = process.env.REACT_APP_YOUTUBE_API_KEY;

  const [newVideo, setNewVideo] = useState({
    title: '',
    url: '',
    description: '',
    category: '',
    favorite: false,
    thumbnail: '',
    videoId: '',
    duration: '',
    channelTitle: ''
  });
  const [newCategory, setNewCategory] = useState('');

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
        onAuthStateChanged(authentication, (user) => {
          if (user) {
            setUser(user);
            setIsAdmin(user.email === ADMIN_EMAIL);
            loadData(firestore);
          } else {
            setUser(null);
            setIsAdmin(false);
            loadData(firestore); // 未ログインでも閲覧可能
          }
        });
      } catch (error) {
        console.error('Firebase初期化エラー:', error);
        initializeLocalData();
      }
    };

    initFirebase();
  }, []);

  // ローカルデータ初期化（Firebase接続失敗時のフォールバック）
  const initializeLocalData = () => {
    setCategories([]);
    setVideos([]);
  };

  // Firebaseからデータ読み込み
  const loadData = async (firestore) => {
    try {
      // カテゴリ読み込み
      const categoriesSnapshot = await getDocs(collection(firestore, 'categories'));
      const firebaseCategories = categoriesSnapshot.docs.map(doc => ({
        id: doc.id, // FirebaseのドキュメントID（必ずユニーク）
        data: doc.data() // カテゴリのデータ
      }));

      console.log('読み込んだカテゴリ:', firebaseCategories);
      setCategories(firebaseCategories);

      // 動画読み込み
      const videosSnapshot = await getDocs(collection(firestore, 'videos'));
      const firebaseVideos = videosSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setVideos(firebaseVideos);
      
    } catch (error) {
      console.error('データ読み込みエラー:', error);
    }
  };

  // YouTube URL から動画IDを抽出
  const extractVideoId = (url) => {
    const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const match = url.match(regex);
    return match ? match[1] : null;
  };

  // YouTube Data API で動画情報を取得
  const fetchVideoInfo = async (videoId) => {
    if (!YOUTUBE_API_KEY) {
      console.warn('YouTube API Key not found. Using mock data.');
      return {
        title: `サンプル動画タイトル - ${videoId}`,
        thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
        channelTitle: 'サンプルチャンネル',
        duration: '10:30'
      };
    }

    try {
      const response = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?id=${videoId}&key=${YOUTUBE_API_KEY}&part=snippet,contentDetails`
      );
      
      if (!response.ok) {
        throw new Error('API request failed');
      }

      const data = await response.json();
      
      if (data.items && data.items.length > 0) {
        const video = data.items[0];
        const snippet = video.snippet;
        const contentDetails = video.contentDetails;
        
        // ISO 8601 duration を mm:ss 形式に変換
        const duration = contentDetails.duration;
        const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
        const hours = parseInt(match[1]) || 0;
        const minutes = parseInt(match[2]) || 0;
        const seconds = parseInt(match[3]) || 0;
        
        let formattedDuration = '';
        if (hours > 0) {
          formattedDuration = `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        } else {
          formattedDuration = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }

        return {
          title: snippet.title,
          thumbnail: snippet.thumbnails.maxres?.url || snippet.thumbnails.high?.url || snippet.thumbnails.medium?.url,
          channelTitle: snippet.channelTitle,
          duration: formattedDuration
        };
      }
      
      return null;
    } catch (error) {
      console.error('YouTube API error:', error);
      // フォールバック
      return {
        title: `動画タイトル - ${videoId}`,
        thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
        channelTitle: 'YouTube',
        duration: '--:--'
      };
    }
  };

  // URL入力時の動画情報自動取得
  const handleUrlChange = async (url) => {
    setNewVideo({...newVideo, url});
    
    const videoId = extractVideoId(url);
    if (videoId) {
      setIsLoading(true);
      const videoInfo = await fetchVideoInfo(videoId);
      if (videoInfo) {
        setNewVideo(prev => ({
          ...prev,
          videoId,
          title: videoInfo.title,
          thumbnail: videoInfo.thumbnail,
          channelTitle: videoInfo.channelTitle,
          duration: videoInfo.duration
        }));
      }
      setIsLoading(false);
    }
  };

  // フィルタリング
  const filteredVideos = videos.filter(video => {
    const matchesSearch = video.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         video.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         video.channelTitle.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || video.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // 動画追加
  const handleAddVideo = async () => {
    if (newVideo.title && newVideo.url && db) {
      try {
        await addDoc(collection(db, 'videos'), newVideo);
        loadData(db);
        setNewVideo({ 
          title: '', url: '', description: '', category: categories[0]?.data?.id || categories[0]?.id || '', 
          favorite: false, thumbnail: '', videoId: '', duration: '', channelTitle: '' 
        });
        setShowAddForm(false);
      } catch (error) {
        console.error('動画追加エラー:', error);
        alert('動画の追加に失敗しました');
      }
    }
  };

  // 動画更新
  const handleUpdateVideo = async () => {
    if (db && editingId) {
      try {
        await updateDoc(doc(db, 'videos', editingId), newVideo);
        loadData(db);
        setNewVideo({ 
          title: '', url: '', description: '', category: categories[0]?.data?.id || categories[0]?.id || '', 
          favorite: false, thumbnail: '', videoId: '', duration: '', channelTitle: '' 
        });
        setShowAddForm(false);
        setEditingId(null);
      } catch (error) {
        console.error('動画更新エラー:', error);
        alert('動画の更新に失敗しました');
      }
    }
  };

  // 動画削除
  const handleDeleteVideo = async (id) => {
    if (db && window.confirm('この動画を削除しますか？')) {
      try {
        await deleteDoc(doc(db, 'videos', id));
        loadData(db);
      } catch (error) {
        console.error('動画削除エラー:', error);
        alert('動画の削除に失敗しました');
      }
    }
  };

  // カテゴリ追加
  const handleAddCategory = async () => {
    if (newCategory && db && !categories.find(cat => cat.data?.id === newCategory.toLowerCase().replace(/\s+/g, '-'))) {
      const category = {
        id: newCategory.toLowerCase().replace(/\s+/g, '-'),
        name: newCategory
      };
      
      try {
        await addDoc(collection(db, 'categories'), category);
        loadData(db);
        setNewCategory('');
        setShowCategoryForm(false);
      } catch (error) {
        console.error('カテゴリ追加エラー:', error);
        alert('カテゴリの追加に失敗しました');
      }
    }
  };

  // 強制リセット機能（開発用・改良版）
  const resetCategories = async () => {
    if (db && window.confirm('すべてのカテゴリをリセットしますか？（開発用）')) {
      try {
        console.log('カテゴリリセット開始');
        
        // 既存のカテゴリをすべて削除
        const categoriesSnapshot = await getDocs(collection(db, 'categories'));
        console.log('削除対象カテゴリ数:', categoriesSnapshot.docs.length);
        
        const deletePromises = categoriesSnapshot.docs.map(doc => deleteDoc(doc.ref));
        await Promise.all(deletePromises);
        console.log('既存カテゴリ削除完了');
        
        // 少し待機
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // 初期カテゴリを再作成
        const initialCategories = [
          { id: 'tutorial', name: 'チュートリアル' },
          { id: 'music', name: '音楽' },
          { id: 'entertainment', name: 'エンターテイメント' },
          { id: 'tech', name: 'テクノロジー' }
        ];
        
        console.log('新しいカテゴリ作成開始');
        const addPromises = initialCategories.map(category => addDoc(collection(db, 'categories'), category));
        await Promise.all(addPromises);
        console.log('新しいカテゴリ作成完了');
        
        // データ再読み込み
        await loadData(db);
        setSelectedCategory('all');
        
        alert('カテゴリをリセットしました');
      } catch (error) {
        console.error('リセットエラー:', error);
        alert('リセットに失敗しました: ' + error.message);
      }
    }
  };
  const handleDeleteCategory = async (categoryDocId, categoryDataId) => {
    if (db && categories.length > 1 && window.confirm('このカテゴリを削除しますか？')) {
      try {
        // Firebaseのドキュメントを削除
        await deleteDoc(doc(db, 'categories', categoryDocId));
        
        // 削除されたカテゴリを使用している動画を最初のカテゴリに変更
        const remainingCategories = categories.filter(cat => cat.id !== categoryDocId);
        const firstCategory = remainingCategories[0];
        
        if (firstCategory) {
          const videosToUpdate = videos.filter(video => video.category === categoryDataId);
          for (const video of videosToUpdate) {
            await updateDoc(doc(db, 'videos', video.id), {
              category: firstCategory.data?.id || firstCategory.id
            });
          }
        }
        
        loadData(db);
        
        // 選択中のカテゴリが削除された場合、「すべて」に変更
        if (selectedCategory === categoryDataId) {
          setSelectedCategory('all');
        }
      } catch (error) {
        console.error('カテゴリ削除エラー:', error);
        alert('カテゴリの削除に失敗しました');
      }
    }
  };

  // お気に入り切り替え
  const toggleFavorite = async (id) => {
    const video = videos.find(v => v.id === id);
    if (video && db) {
      try {
        await updateDoc(doc(db, 'videos', id), { favorite: !video.favorite });
        loadData(db);
      } catch (error) {
        console.error('お気に入り更新エラー:', error);
      }
    }
  };

  // 編集開始
  const handleEditVideo = (id) => {
    const video = videos.find(v => v.id === id);
    if (video) {
      setNewVideo(video);
      setEditingId(id);
      setShowAddForm(true);
    }
  };

  // ログイン
  const handleLogin = async () => {
    if (auth) {
      try {
        const provider = new GoogleAuthProvider();
        await signInWithPopup(auth, provider);
      } catch (error) {
        console.error('ログインエラー:', error);
        alert('ログインに失敗しました');
      }
    }
  };

  // ログアウト
  const handleLogout = async () => {
    if (auth) {
      try {
        await signOut(auth);
      } catch (error) {
        console.error('ログアウトエラー:', error);
      }
    }
  };

  // 動画再生モーダル
  const openVideoModal = (video) => {
    setSelectedVideo(video);
  };

  const closeVideoModal = () => {
    setSelectedVideo(null);
  };

  return (
    <div className="min-h-screen bg-gray-50 text-black">
      {/* ヘッダー */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <Video className="w-8 h-8 text-red-600 mr-3" />
              <div>
                <h1 className="text-2xl font-bold">MyTube</h1>
                <p className="text-gray-600 text-sm">
                  {user && `${isAdmin ? '管理者' : 'ゲスト（閲覧のみ）'}として${user.displayName || user.email}でログイン中`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {user ? (
                <button
                  onClick={handleLogout}
                  className="px-3 py-2 text-sm border border-gray-300 rounded hover:border-black"
                >
                  ログアウト
                </button>
              ) : (
                <button
                  onClick={handleLogin}
                  className="px-3 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  管理者ログイン
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6">
        {/* 検索 */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="動画を検索..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
            />
          </div>
        </div>

        {/* カテゴリとボタン */}
        <div className="mb-6 flex flex-wrap gap-2 items-center">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-4 py-2 text-sm rounded-full transition-colors ${
              selectedCategory === 'all'
                ? 'bg-red-600 text-white'
                : 'bg-white text-gray-700 border border-gray-300 hover:border-red-500'
            }`}
          >
            すべて
          </button>
          {categories.map((category, index) => (
            <div key={`${category.id}-${index}`} className="flex items-stretch">
              <button
                onClick={() => setSelectedCategory(category.data?.id || category.id)}
                className={`px-4 py-2 text-sm transition-colors ${
                  isAdmin ? 'rounded-l-full' : 'rounded-full'
                } ${
                  selectedCategory === (category.data?.id || category.id)
                    ? 'bg-red-600 text-white'
                    : 'bg-white text-gray-700 border border-gray-300 hover:border-red-500'
                }`}
              >
                {category.data?.name || category.name}
              </button>
              {isAdmin && (
                <button
                  onClick={() => handleDeleteCategory(category.id, category.data?.id || category.id)}
                  className="px-2 py-2 text-sm border-r border-t border-b border-gray-300 hover:border-red-500 hover:bg-red-50 rounded-r-full bg-white text-gray-500 hover:text-red-600"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
          {isAdmin && (
            <button
              onClick={() => setShowCategoryForm(true)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-full hover:border-red-500 hover:bg-red-50 text-gray-700"
            >
              <Plus className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* カテゴリ追加フォーム */}
        {showCategoryForm && isAdmin && (
          <div className="mb-6 p-4 bg-white border border-gray-300 rounded-lg shadow-sm">
            <h3 className="text-lg font-semibold mb-3">新しいカテゴリ</h3>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="カテゴリ名"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-red-500"
              />
              <button
                onClick={handleAddCategory}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              >
                追加
              </button>
              <button
                onClick={() => {
                  setShowCategoryForm(false);
                  setNewCategory('');
                }}
                className="px-4 py-2 border border-gray-300 rounded hover:border-black"
              >
                キャンセル
              </button>
            </div>
          </div>
        )}

        {/* 動画追加ボタン */}
        {isAdmin && (
          <div className="mb-6">
            <button
              onClick={() => setShowAddForm(true)}
              className="flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 shadow-sm"
            >
              <Plus className="w-4 h-4 mr-2" />
              動画追加
            </button>
          </div>
        )}

        {/* 動画追加/編集フォーム */}
        {showAddForm && isAdmin && (
          <div className="mb-6 p-6 bg-white border border-gray-300 rounded-lg shadow-sm">
            <h3 className="text-lg font-semibold mb-4">
              {editingId ? '動画編集' : '動画追加'}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">YouTube URL</label>
                <input
                  type="url"
                  placeholder="https://www.youtube.com/watch?v=..."
                  value={newVideo.url}
                  onChange={(e) => handleUrlChange(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-red-500"
                />
                {isLoading && <p className="text-sm text-gray-500 mt-1">動画情報を取得中...</p>}
              </div>
              
              {newVideo.thumbnail && (
                <div className="flex gap-4">
                  <img
                    src={newVideo.thumbnail}
                    alt="サムネイル"
                    className="w-32 h-24 object-cover rounded"
                  />
                  <div className="flex-1">
                    <p className="font-medium">{newVideo.title}</p>
                    <p className="text-sm text-gray-600">{newVideo.channelTitle}</p>
                    <p className="text-sm text-gray-500">{newVideo.duration}</p>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">タイトル</label>
                <input
                  type="text"
                  placeholder="動画タイトル"
                  value={newVideo.title}
                  onChange={(e) => setNewVideo({...newVideo, title: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-red-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">説明</label>
                <textarea
                  placeholder="動画の説明"
                  value={newVideo.description}
                  onChange={(e) => setNewVideo({...newVideo, description: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-red-500 resize-none"
                  rows="3"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">カテゴリ</label>
                <select
                  value={newVideo.category}
                  onChange={(e) => setNewVideo({...newVideo, category: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-red-500"
                >
                  {categories.map(category => (
                    <option key={category.id} value={category.data?.id || category.id}>
                      {category.data?.name || category.name}
                    </option>
                  ))}
                </select>
              </div>

              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={newVideo.favorite}
                  onChange={(e) => setNewVideo({...newVideo, favorite: e.target.checked})}
                  className="mr-2 rounded"
                />
                <span className="text-sm">お気に入り</span>
              </label>

              <div className="flex gap-2">
                <button
                  onClick={editingId ? handleUpdateVideo : handleAddVideo}
                  className="px-6 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                >
                  {editingId ? '更新' : '追加'}
                </button>
                <button
                  onClick={() => {
                    setShowAddForm(false);
                    setEditingId(null);
                    setNewVideo({ 
                      title: '', url: '', description: '', category: categories[0]?.data?.id || categories[0]?.id || '', 
                      favorite: false, thumbnail: '', videoId: '', duration: '', channelTitle: '' 
                    });
                  }}
                  className="px-6 py-2 border border-gray-300 rounded hover:border-black"
                >
                  キャンセル
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 動画一覧 */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredVideos.map(video => (
            <div key={video.id} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
              <div className="relative">
                <img
                  src={video.thumbnail}
                  alt={video.title}
                  className="w-full h-48 object-cover cursor-pointer"
                  onClick={() => openVideoModal(video)}
                />
                <div className="absolute inset-0 bg-black bg-opacity-0 hover:bg-opacity-30 transition-all cursor-pointer flex items-center justify-center"
                     onClick={() => openVideoModal(video)}>
                  <Play className="w-12 h-12 text-white opacity-0 hover:opacity-100 transition-opacity" />
                </div>
                <div className="absolute bottom-2 right-2 bg-black bg-opacity-70 text-white text-xs px-2 py-1 rounded">
                  {video.duration}
                </div>
                {video.favorite && (
                  <Heart className="absolute top-2 left-2 w-5 h-5 text-red-500 fill-current" />
                )}
              </div>
              
              <div className="p-4">
                <h3 className="font-semibold text-lg mb-1 line-clamp-2">{video.title}</h3>
                <p className="text-gray-600 text-sm mb-2">{video.channelTitle}</p>
                {video.description && (
                  <p className="text-gray-500 text-sm mb-3 line-clamp-2">{video.description}</p>
                )}
                
                <div className="flex items-center justify-between">
                  <span className="inline-block bg-gray-100 text-gray-700 text-xs px-2 py-1 rounded-full">
                    {categories.find(cat => (cat.data?.id || cat.id) === video.category)?.data?.name || 
                     categories.find(cat => (cat.data?.id || cat.id) === video.category)?.name}
                  </span>
                  
                  <div className="flex gap-1">
                    <button
                      onClick={() => window.open(video.url, '_blank')}
                      className="p-2 hover:bg-gray-100 rounded"
                      title="YouTubeで開く"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </button>
                    
                    {isAdmin && (
                      <>
                        <button
                          onClick={() => toggleFavorite(video.id)}
                          className="p-2 hover:bg-gray-100 rounded"
                          title="お気に入り"
                        >
                          <Heart className={`w-4 h-4 ${video.favorite ? 'fill-current text-red-500' : 'text-gray-400'}`} />
                        </button>
                        <button
                          onClick={() => handleEditVideo(video.id)}
                          className="p-2 hover:bg-gray-100 rounded"
                          title="編集"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteVideo(video.id)}
                          className="p-2 hover:bg-gray-100 rounded text-red-500"
                          title="削除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {filteredVideos.length === 0 && (
          <div className="text-center py-12">
            <Video className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500 text-lg">動画が見つかりません</p>
          </div>
        )}
      </div>

      {/* 動画再生モーダル */}
      {selectedVideo && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-full overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold">{selectedVideo.title}</h3>
              <button
                onClick={closeVideoModal}
                className="p-2 hover:bg-gray-100 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="aspect-video">
              <iframe
                width="100%"
                height="100%"
                src={`https://www.youtube.com/embed/${selectedVideo.videoId}`}
                title={selectedVideo.title}
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
            <div className="p-4">
              <p className="text-gray-600 mb-2">{selectedVideo.channelTitle}</p>
              {selectedVideo.description && (
                <p className="text-gray-700">{selectedVideo.description}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;