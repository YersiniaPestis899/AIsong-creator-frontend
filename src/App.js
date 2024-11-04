import React, { useState, useRef } from 'react';
import { Mic, RefreshCw, XSquare, Play } from 'lucide-react';
import GuideCharacter from './Components/GuideCharacter';
import NotePaper from './Components/NotePaper';
import GenerationProgress from './Components/GenerationProgress';
import QRCode from './Components/QRCode';
import axios from 'axios';
import config from './config';

// Axiosのデフォルト設定
axios.defaults.baseURL = config.apiUrl;

const App = () => {
  // State管理
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(-1);
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [answers, setAnswers] = useState([]);
  const [answer, setAnswer] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [musicUrl, setMusicUrl] = useState(null);
  const [notification, setNotification] = useState({ type: '', message: '' });

  // Refs
  const audioPlayer = useRef(new Audio());
  const mediaRecorder = useRef(null);

  // インタビューを開始
  const startInterview = async () => {
    setCurrentQuestionIndex(0);
    await getNextQuestion(0);
  };

  // 次の質問を取得
  const getNextQuestion = async (index) => {
    try {
      // デバッグ用のログ追加
      console.log(`Attempting to fetch question ${index}`);
      
      // まずデバッグエンドポイントを試す
      try {
        const debugResponse = await axios.get('/api/debug');
        console.log('Debug endpoint response:', debugResponse.data);
      } catch (debugError) {
        console.log('Debug endpoint error:', debugError);
      }
  
      const response = await axios.post(`/api/questions/${index}`);
      console.log('Question response:', response.data);
  
      if (response.data.question) {
        setCurrentQuestion(response.data.question);
        if (response.data.audio && response.data.audio !== "test_audio") {
          playAudio(response.data.audio);
        }
      } else {
        throw new Error('Invalid response format');
      }
    } catch (error) {
      console.error('Error getting question:', error);
      console.error('Full error object:', JSON.stringify(error, null, 2));
      console.error('Response data:', error.response?.data);
      setNotification({
        type: 'error',
        message: `質問の取得に失敗しました: ${error.response?.data?.detail || error.message}`
      });
    }
  };

  // 音声を再生
  const playAudio = (base64Audio) => {
    try {
      setIsSpeaking(true);
      const audioData = Uint8Array.from(atob(base64Audio), c => c.charCodeAt(0));
      const audioBlob = new Blob([audioData], { type: 'audio/mp3' });
      const audioUrl = URL.createObjectURL(audioBlob);
      
      audioPlayer.current.src = audioUrl;
      audioPlayer.current.onended = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(audioUrl);
      };
      
      audioPlayer.current.onerror = (error) => {
        console.error('Error playing audio:', error);
        setIsSpeaking(false);
        URL.revokeObjectURL(audioUrl);
        setNotification({
          type: 'error',
          message: '音声の再生に失敗しました'
        });
      };
      
      audioPlayer.current.play().catch(error => {
        console.error('Error playing audio:', error);
        setIsSpeaking(false);
        setNotification({
          type: 'error',
          message: '音声の再生に失敗しました'
        });
      });
    } catch (error) {
      console.error('Error processing audio:', error);
      setIsSpeaking(false);
      setNotification({
        type: 'error',
        message: '音声の処理に失敗しました'
      });
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
    
    const newAnswers = [...answers, answer];
    setAnswers(newAnswers);
    setAnswer('');

    if (currentQuestionIndex < 4) {
      setCurrentQuestionIndex(prev => prev + 1);
      await getNextQuestion(currentQuestionIndex + 1);
    } else {
      // 全質問終了、音楽生成開始
      await generateMusic(newAnswers);
    }
  };

  // 音楽を生成
  const generateMusic = async (themes) => {
    setIsGenerating(true);
    setNotification({
      type: 'info',
      message: '音楽を生成中です...'
    });

    try {
      const response = await axios.post('/api/generate-music', { themes });
      setMusicUrl(response.data.video_url);
      setNotification({
        type: 'success',
        message: '音楽の生成が完了しました！'
      });
      
      if (response.data.video_url) {
        window.open(response.data.video_url, '_blank');
      }
    } catch (error) {
      console.error('Error generating music:', error);
      setNotification({
        type: 'error',
        message: '音楽の生成に失敗しました: ' + (error.response?.data?.detail || error.message)
      });
    } finally {
      setIsGenerating(false);
    }
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

          const response = await axios.post('/api/transcribe', formData, {
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
      setNotification({ 
        type: 'info', 
        message: '録音中...' 
      });
      
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

  // アプリケーションのリセット
  const resetApplication = () => {
    setCurrentQuestionIndex(-1);
    setCurrentQuestion('');
    setAnswers([]);
    setAnswer('');
    setIsRecording(false);
    setIsSpeaking(false);
    setIsGenerating(false);
    setMusicUrl(null);
    setNotification({ 
      type: 'info', 
      message: 'アプリケーションをリセットしました' 
    });
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