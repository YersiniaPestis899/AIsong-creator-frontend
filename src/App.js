import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, RefreshCw, XSquare, Play } from 'lucide-react';
import GuideCharacter from './Components/GuideCharacter';
import NotePaper from './Components/NotePaper';
import GenerationProgress from './Components/GenerationProgress';
import QRCode from './Components/QRCode';

const App = () => {
  // State管理
  const [isStarted, setIsStarted] = useState(false);  // 追加: スタート状態
  const [connected, setConnected] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [musicError, setMusicError] = useState('');
  const [notification, setNotification] = useState({ type: '', message: '' });
  const [generationStatus, setGenerationStatus] = useState(null);
  const [musicData, setMusicData] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // Refs
  const ws = useRef(null);
  const mediaRecorder = useRef(null);
  const reconnectAttempts = useRef(0);
  const audioPlayer = useRef(new Audio());
  const maxReconnectAttempts = 5;

  // WebSocket終了処理
  const closeWebSocket = useCallback(() => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.close(1000);
    }
  }, []);

  // WebSocketメッセージ処理
  const handleWebSocketMessage = useCallback(async (data) => {
    try {
      switch (data.type) {
        case 'speech':
          try {
            setIsSpeaking(true);
            const audioData = Uint8Array.from(atob(data.audio), c => c.charCodeAt(0));
            const audioBlob = new Blob([audioData], { type: 'audio/mp3' });
            const audioUrl = URL.createObjectURL(audioBlob);
            
            setCurrentQuestion(data.text);
            
            const playAudio = async () => {
              return new Promise((resolve, reject) => {
                audioPlayer.current.src = audioUrl;
                
                audioPlayer.current.onended = () => {
                  setIsSpeaking(false);
                  URL.revokeObjectURL(audioUrl);
                  resolve();
                };
                
                audioPlayer.current.onerror = (error) => {
                  setIsSpeaking(false);
                  URL.revokeObjectURL(audioUrl);
                  reject(error);
                };
                
                audioPlayer.current.play().catch(reject);
              });
            };
            
            await playAudio();
            
          } catch (error) {
            console.error('Error playing audio:', error);
            setIsSpeaking(false);
            setNotification({
              type: 'error',
              message: '音声の再生に失敗しました'
            });
          }
          break;

        case 'status_update':
          if (data.status === 'generating_music') {
            setIsGenerating(true);
          }
          setGenerationStatus(data.status);
          setNotification({ 
            type: 'info', 
            message: data.status === 'generating_music' ? 'ミュージックビデオを生成中です' : '処理中...' 
          });
          break;
          
        case 'generation_progress':
          setNotification({
            type: 'info',
            message: `楽曲生成中... ${data.progress}%`
          });
          break;
          
        case 'music_complete':
          setGenerationStatus('complete');
          setMusicData(data.data);
          if (data.data.video_url) {
            window.open(data.data.video_url, '_blank');
          }
          setNotification({ type: 'success', message: 'ミュージックビデオの生成が完了しました！' });
          setIsGenerating(true);  // 生成完了後も再接続を防ぐ
          closeWebSocket();
          break;
          
        case 'music_error':
          setGenerationStatus(null);
          setMusicError(data.data);
          setNotification({ type: 'error', message: `エラーが発生しました: ${data.data}` });
          setIsGenerating(false);
          break;
          
        case 'error':
          setNotification({ type: 'error', message: data.message });
          break;
      }
    } catch (error) {
      console.error('Error processing WebSocket message:', error);
      setNotification({ type: 'error', message: 'メッセージの処理中にエラーが発生しました' });
    }
  }, [closeWebSocket]);

  // WebSocket接続管理
  const connectWebSocket = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN) return;
  
    // 現在のホストに基づいてWSのURLを構築
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = process.env.REACT_APP_WS_URL || 
      `${protocol}//${window.location.host}/ws`;
    
    console.log('Connecting to WebSocket:', wsUrl); // デバッグ用
  
    ws.current = new WebSocket(wsUrl);
  
    ws.current.onopen = () => {
      console.log('WebSocket connected');
      setConnected(true);
      reconnectAttempts.current = 0;
      if (!isGenerating) {
        setNotification({ type: 'success', message: 'サーバーに接続しました' });
      }
    };
  
    ws.current.onerror = (error) => {
      console.error('WebSocket connection error:', error);
      setNotification({
        type: 'error',
        message: 'WebSocket接続エラー：サーバーに接続できません'
      });
    };

    ws.current.onclose = (event) => {
      setConnected(false);
      setIsStarted(false);  // 接続が切れたらスタート状態をリセット
      
      if (isGenerating) {
        setNotification({ type: 'info', message: '楽曲生成中です。しばらくお待ちください。' });
        return;
      }
    };

    ws.current.onerror = (error) => {
      console.error('WebSocket error:', error);
      if (!isGenerating) {
        setNotification({ type: 'error', message: 'WebSocket接続エラーが発生しました' });
      }
    };
  }, [isGenerating, handleWebSocketMessage]);

// WebSocket接続の開始
const startInterview = useCallback(() => {
  if (!isStarted) {
    setIsStarted(true);
    connectWebSocket();
  }
}, [isStarted, connectWebSocket]);

// アプリケーションのリセット
const resetApplication = () => {
  closeWebSocket();
  setCurrentQuestion('');
  setAnswer('');
  setIsRecording(false);
  setMusicError('');
  setGenerationStatus(null);
  setMusicData(null);
  setIsGenerating(false);
  setIsStarted(false);  // スタート状態もリセット
  setNotification({ type: 'info', message: 'アプリケーションをリセットしました' });
};

// 録音開始
const startRecording = async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      } 
    });

    mediaRecorder.current = new MediaRecorder(stream, {
      mimeType: 'audio/webm;codecs=opus'
    });

    const chunks = [];

    mediaRecorder.current.ondataavailable = (e) => chunks.push(e.data);
    mediaRecorder.current.onstop = async () => {
      try {
        const blob = new Blob(chunks, { type: 'audio/webm;codecs=opus' });
        setAnswer('音声を認識中...');
        
        const formData = new FormData();
        formData.append('file', blob, 'audio.webm');

        const response = await fetch('http://localhost:8000/transcribe', {
          method: 'POST',
          body: formData
        });
        
        if (!response.ok) {
          throw new Error('音声認識に失敗しました');
        }
        
        const data = await response.json();
        
        if (data.transcription) {
          setAnswer(data.transcription);
          setNotification({ type: 'success', message: '音声を認識しました' });
        } else {
          setNotification({ type: 'warning', message: '音声を認識できませんでした。もう一度お試しください。' });
          setAnswer('');
        }
      } catch (error) {
        console.error('Transcription error:', error);
        setNotification({ type: 'error', message: '音声認識に失敗しました' });
        setAnswer('');
      }
    };

    mediaRecorder.current.start();
    setIsRecording(true);
    setNotification({ type: 'info', message: '録音中...' });
    
  } catch (error) {
    console.error('Error starting recording:', error);
    setNotification({ 
      type: 'error', 
      message: 'マイクを起動できませんでした。マイクの許可を確認してください。' 
    });
  }
};

// 録音停止
const stopRecording = () => {
  if (mediaRecorder.current?.state === 'recording') {
    mediaRecorder.current.stop();
    setIsRecording(false);

    // ストリームを停止
    mediaRecorder.current.stream.getTracks().forEach(track => track.stop());
  }
};

// 回答送信
const sendAnswer = () => {
  if (ws.current?.readyState === WebSocket.OPEN && answer) {
    ws.current.send(answer);
    setAnswer('');
    setNotification({ type: 'success', message: '回答を送信しました' });
  } else {
    setNotification({ type: 'error', message: '回答を入力してください' });
  }
};

return (
  <div className="min-h-screen bg-gradient-to-b from-wood-light to-wood-DEFAULT">
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      {/* 黒板風のメインカード */}
      <div className="bg-chalkboard rounded-lg shadow-2xl p-8 relative border-8 border-wood-dark chalkboard chalk-dust">
        {/* チョークトレイの装飾 */}
        <div className="absolute left-0 right-0 -bottom-4 h-3 bg-wood-dark"></div>
        
        {/* ヘッダー部分 */}
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-chalk font-bold text-white chalk-effect">
            Your Song Creator
          </h1>
          <div className="flex gap-3">
            <button 
              onClick={resetApplication}
              className="p-2 rounded-full hover:bg-chalkboard-light transition-colors"
              title="リセット"
            >
              <RefreshCw className="w-6 h-6 text-white" />
            </button>
          </div>
        </div>

        {/* メインコンテンツエリア */}
        <div className="bg-paper-DEFAULT rounded-lg p-6 shadow-inner paper-texture">
          {!isStarted ? (
            // スタート前の画面
            <div className="text-center py-12">
              <h2 className="text-2xl font-handwriting mb-6">
                あなたの思い出から素敵な楽曲を作ります
              </h2>
              <button
                onClick={startInterview}
                className="bg-green-500 hover:bg-green-600 text-white 
                  px-8 py-4 rounded-lg font-handwriting text-xl
                  transition-colors shadow-md flex items-center justify-center 
                  gap-3 mx-auto"
              >
                <Play className="w-6 h-6" />
                インタビューを始める
              </button>
            </div>
          ) : (
            // インタビュー開始後の画面
            <>
              {/* キャラクター表示部分 */}
              <div className="mb-8">
                <GuideCharacter 
                  speaking={isSpeaking} 
                  emotion={currentQuestion ? 'happy' : 'neutral'} 
                />
              </div>

              {/* 質問表示エリア */}
              {currentQuestion && (
                <NotePaper accent="green">
                  <p className="text-gray-700 text-center text-lg mb-4">
                    {currentQuestion}
                  </p>
                </NotePaper>
              )}

              {/* 回答入力エリア */}
              <div className="mt-4 space-y-4">
                <div className="relative">
                  <input
                    type="text"
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    disabled={!currentQuestion || isRecording}
                    placeholder="回答を入力してください"
                    className="w-full px-4 py-3 bg-white/90 backdrop-blur-sm rounded-lg 
                      font-handwriting text-lg border-2 border-gray-300 
                      focus:border-blue-500 focus:ring-2 focus:ring-blue-200 
                      transition-all duration-200 shadow-inner
                      disabled:bg-gray-100 disabled:cursor-not-allowed
                      placeholder:text-gray-400"
                  />
                </div>
                
                {/* 操作ボタン */}
                <div className="flex gap-3">
                  <button 
                    onClick={isRecording ? stopRecording : startRecording}
                    disabled={!currentQuestion}
                    className={`flex-1 ${
                      isRecording 
                        ? 'bg-red-500 hover:bg-red-600' 
                        : 'bg-blue-500 hover:bg-blue-600'
                    } text-white px-4 py-3 rounded-lg font-handwriting 
                      transition-colors flex items-center justify-center gap-2 
                      shadow-md disabled:bg-gray-400 disabled:cursor-not-allowed`}
                  >
                    {isRecording ? <XSquare className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                    {isRecording ? '録音停止' : '録音開始'}
                  </button>
                  <button
                    onClick={sendAnswer}
                    disabled={!answer || isRecording}
                    className="flex-1 bg-green-500 hover:bg-green-600 
                      disabled:bg-gray-400 disabled:cursor-not-allowed
                      text-white px-4 py-3 rounded-lg font-handwriting 
                      transition-colors shadow-md"
                  >
                    回答を送信
                  </button>
                </div>
              </div>

              {/* 進捗表示 */}
              {generationStatus && (
                <div className="mt-6">
                  <GenerationProgress status={generationStatus} />
                </div>
              )}

              {/* エラー表示 */}
              {musicError && (
                <NotePaper accent="red">
                  <p className="text-red-600">エラーが発生しました: {musicError}</p>
                </NotePaper>
              )}

              {/* 完了メッセージとQRコード */}
              {musicData && musicData.video_url && (
                <div className="mt-6 space-y-4">
                  <NotePaper accent="green">
                    <p className="text-green-600 text-center font-bold mb-2">
                      ミュージックビデオの生成が完了しました！
                    </p>
                    <div className="flex flex-col items-center gap-4">
                      <button
                        onClick={() => window.open(musicData.video_url, '_blank')}
                        className="w-full max-w-sm bg-blue-500 hover:bg-blue-600 
                          text-white px-6 py-3 rounded-lg font-handwriting 
                          transition-colors shadow-md transform hover:scale-105 
                          duration-200"
                      >
                        ブラウザで視聴する
                      </button>
                      
                      {/* QRコード表示エリア */}
                      <div className="w-full max-w-sm">
                        <QRCode url={musicData.video_url} />
                      </div>
                    </div>
                  </NotePaper>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>

    {/* 通知メッセージ */}
    {notification.message && (
      <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2">
        <div className={`px-6 py-3 rounded-lg shadow-lg text-white font-handwriting ${
          notification.type === 'error' ? 'bg-red-500' :
          notification.type === 'success' ? 'bg-green-500' :
          notification.type === 'warning' ? 'bg-yellow-500' :
          'bg-blue-500'
        }`}>
          <p>{notification.message}</p>
        </div>
      </div>
    )}
  </div>
);
};

export default App;