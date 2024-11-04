import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, RefreshCw, XSquare, Play } from 'lucide-react';
import GuideCharacter from './Components/GuideCharacter';
import NotePaper from './Components/NotePaper';
import GenerationProgress from './Components/GenerationProgress';
import QRCode from './Components/QRCode';
import axios from 'axios';

const App = () => {
  // State管理
  const [isStarted, setIsStarted] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(-1);  // 追加
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [musicError, setMusicError] = useState('');
  const [notification, setNotification] = useState({ type: '', message: '' });
  const [generationStatus, setGenerationStatus] = useState(null);
  const [musicData, setMusicData] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [musicUrl, setMusicUrl] = useState(null);  // 追加

  // Refs
  const audioPlayer = useRef(new Audio());
  const mediaRecorder = useRef(null);
  const ws = useRef(null);
  const reconnectAttempts = useRef(0);
  const reconnectTimeout = useRef(null);
  const maxReconnectAttempts = 5;
  const isUnmounting = useRef(false);

  // 環境変数からURLを取得
  const WS_URL = process.env.REACT_APP_WS_URL || 'ws://localhost:8000/ws';
  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

  // WebSocketメッセージ処理
  const handleWebSocketMessage = useCallback(async (data) => {
    try {
      console.log('Received WebSocket message:', data);
      switch (data.type) {
        case 'speech':
          try {
            setIsSpeaking(true);
            const audioData = Uint8Array.from(atob(data.audio), c => c.charCodeAt(0));
            const audioBlob = new Blob([audioData], { type: 'audio/mp3' });
            const audioUrl = URL.createObjectURL(audioBlob);
            
            setCurrentQuestion(data.text);
            
            audioPlayer.current.src = audioUrl;
            audioPlayer.current.onended = () => {
              setIsSpeaking(false);
              URL.revokeObjectURL(audioUrl);
            };
            
            audioPlayer.current.onerror = (error) => {
              console.error('Audio playback error:', error);
              setIsSpeaking(false);
              URL.revokeObjectURL(audioUrl);
              setNotification({
                type: 'error',
                message: '音声の再生に失敗しました'
              });
            };
            
            await audioPlayer.current.play();
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
          
        // music_completeケースの処理を修正
        case 'music_complete':
          setGenerationStatus('complete');
          setMusicData(data.data);
          if (data.data.video_url) {
            setMusicUrl(data.data.video_url);  // musicUrlを設定
            window.open(data.data.video_url, '_blank');
          }
            setNotification({ 
            type: 'success', 
            message: 'ミュージックビデオの生成が完了しました！' 
          });
          setIsGenerating(false);
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
  }, []);

  // WebSocket再接続
  const reconnectWebSocket = useCallback(() => {
    if (isUnmounting.current || reconnectAttempts.current >= maxReconnectAttempts) return;

    console.log(`Attempting to reconnect (${reconnectAttempts.current + 1}/${maxReconnectAttempts})`);
    reconnectTimeout.current = setTimeout(() => {
      reconnectAttempts.current += 1;
      connectWebSocket();
    }, Math.min(1000 * Math.pow(2, reconnectAttempts.current), 10000));
  }, []);

  // WebSocket接続処理
const connectWebSocket = useCallback(() => {
  if (ws.current?.readyState === WebSocket.OPEN || isUnmounting.current) return;

  console.log('Connecting to WebSocket:', WS_URL);
  
  try {
    ws.current = new WebSocket(WS_URL);

    ws.current.onopen = () => {
      console.log('WebSocket connected successfully');
      setNotification({ type: 'success', message: 'サーバーに接続しました' });
      reconnectAttempts.current = 0;
      setIsStarted(true);
    };

    ws.current.onmessage = async (event) => {
      try {
        console.log('Received message:', event.data);
        const data = JSON.parse(event.data);
        await handleWebSocketMessage(data);
      } catch (error) {
        console.error('Error processing message:', error);
      }
    };

    ws.current.onclose = (event) => {
      console.log('WebSocket connection closed:', event);
      setIsStarted(false);
      
      if (isGenerating) {
        setNotification({ type: 'info', message: '楽曲生成中です。しばらくお待ちください。' });
        return;
      }

      // 無料プランの5分切断に対する再接続ロジック
      if (!isUnmounting.current && reconnectAttempts.current < maxReconnectAttempts) {
        setNotification({ 
          type: 'warning', 
          message: 'サーバーとの接続が切断されました。再接続を試みています...' 
        });
        
        // 指数バックオフを使用した再接続
        const timeout = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 10000);
        reconnectTimeout.current = setTimeout(() => {
          reconnectAttempts.current += 1;
          connectWebSocket();
        }, timeout);
      }
    };

    ws.current.onerror = (error) => {
      console.error('WebSocket error:', error);
      if (!isGenerating) {
        setNotification({ 
          type: 'error', 
          message: 'WebSocket接続エラーが発生しました。ネットワーク接続を確認してください。' 
        });
      }
    };
  } catch (error) {
    console.error('Error creating WebSocket connection:', error);
    setNotification({ 
      type: 'error', 
      message: 'WebSocket接続の作成に失敗しました' 
    });
  }
}, [WS_URL, handleWebSocketMessage, isGenerating]);

// クリーンアップ時の処理
useEffect(() => {
  return () => {
    isUnmounting.current = true;
    if (reconnectTimeout.current) {
      clearTimeout(reconnectTimeout.current);
    }
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.close();
    }
  };
}, []);

  // インタビューを開始
  const startInterview = useCallback(() => {
    setIsStarted(true);
    reconnectAttempts.current = 0;
    connectWebSocket();
  }, [connectWebSocket]);

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

          const response = await axios.post(`${API_URL}/transcribe`, formData, {
            headers: {
              'Content-Type': 'multipart/form-data',
            },
          });
          
          if (response.data.transcription) {
            setAnswer(response.data.transcription);
            setNotification({ 
              type: 'success', 
              message: '音声を認識しました' 
            });
          } else {
            setNotification({ 
              type: 'warning', 
              message: '音声を認識できませんでした。もう一度お試しください。' 
            });
            setAnswer('');
          }
        } catch (error) {
          console.error('Transcription error:', error);
          setNotification({ 
            type: 'error', 
            message: '音声認識に失敗しました: ' + (error.response?.data?.detail || error.message)
          });
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

  // 回答を送信
  const submitAnswer = async () => {
    if (!answer) {
      setNotification({
        type: 'warning',
        message: '回答を入力してください'
      });
      return;
    }

    try {
      if (ws.current?.readyState === WebSocket.OPEN) {
        ws.current.send(answer);
        setAnswer('');
        setNotification({
          type: 'success',
          message: '回答を送信しました'
        });
      } else {
        console.log('WebSocket not connected. Attempting to reconnect...');
        connectWebSocket();
        throw new Error('WebSocket接続が確立されていません');
      }
    } catch (error) {
      console.error('Error sending answer:', error);
      setNotification({
        type: 'error',
        message: '回答の送信に失敗しました'
      });
    }
  };

  // アプリケーションのリセット処理を修正
const resetApplication = () => {
  if (ws.current?.readyState === WebSocket.OPEN) {
    ws.current.close();
  }
  if (reconnectTimeout.current) {
    clearTimeout(reconnectTimeout.current);
  }
  reconnectAttempts.current = 0;
  setCurrentQuestionIndex(-1);  // 追加
  setCurrentQuestion('');
  setAnswer('');
  setIsRecording(false);
  setIsSpeaking(false);
  setIsGenerating(false);
  setMusicData(null);
  setMusicUrl(null);  // 追加
  setIsStarted(false);
  setGenerationStatus(null);
  setMusicError('');
  setNotification({ 
    type: 'info', 
    message: 'アプリケーションをリセットしました' 
  });
};

  // クリーンアップ
  useEffect(() => {
    return () => {
      isUnmounting.current = true;
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
      }
      if (ws.current?.readyState === WebSocket.OPEN) {
        ws.current.close();
      }
    };
  }, []);

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
            {currentQuestionIndex === -1 ? (
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
                      disabled={!currentQuestion || isRecording || isGenerating}
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
                      disabled={!currentQuestion || isGenerating}
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
                      onClick={submitAnswer}
                      disabled={!answer || isRecording || isGenerating}
                      className="flex-1 bg-green-500 hover:bg-green-600 
                        disabled:bg-gray-400 disabled:cursor-not-allowed
                        text-white px-4 py-3 rounded-lg font-handwriting 
                        transition-colors shadow-md"
                    >
                      回答を送信
                    </button>
                  </div>
                </div>

                {/* 生成状態表示 */}
                {isGenerating && (
                  <div className="mt-6">
                    <GenerationProgress />
                  </div>
                )}

                {/* 完了メッセージとQRコード */}
                {musicUrl && (
                  <div className="mt-6 space-y-4">
                    <NotePaper accent="green">
                      <p className="text-green-600 text-center font-bold mb-2">
                        ミュージックビデオの生成が完了しました！
                      </p>
                      <div className="flex flex-col items-center gap-4">
                        <button
                          onClick={() => window.open(musicUrl, '_blank')}
                          className="w-full max-w-sm bg-blue-500 hover:bg-blue-600 
                            text-white px-6 py-3 rounded-lg font-handwriting 
                            transition-colors shadow-md transform hover:scale-105 
                            duration-200"
                        >
                          ブラウザで視聴する
                        </button>
                        
                        {/* QRコード表示エリア */}
                        <div className="w-full max-w-sm">
                          <QRCode url={musicUrl} />
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