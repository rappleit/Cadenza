import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Card, Button, Typography, Space, Alert } from 'antd';
import { CameraOutlined, PlayCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import { useExercise } from '../../context/ExerciseContext';

const { Title, Text } = Typography;

const StretchWebcam = ({ onExerciseSelect }) => {
  const iframeRef = useRef(null);
  const [isIframeReady, setIsIframeReady] = useState(false);
  const [availableExercises, setAvailableExercises] = useState([]);
  const [selectedExercise, setSelectedExercise] = useState(null);
  const [currentExercise, setCurrentExercise] = useState(null);
  const [isExerciseActive, setIsExerciseActive] = useState(false);
  const [exerciseCompleted, setExerciseCompleted] = useState(false);
  const [error, setError] = useState(null);
  const [completedInSession, setCompletedInSession] = useState([]);
  const lastCompletionRef = useRef({ time: 0, exercise: null });
  
  const { addCompletedExercise, resetDailyProgress, getCompletedCount, dailyGoal } = useExercise();
  
  // Send message to iframe
  const sendMessageToIframe = useCallback((type, data) => {
    if (iframeRef.current && iframeRef.current.contentWindow) {
      iframeRef.current.contentWindow.postMessage({
        type: type,
        data: data,
        source: 'react-app'
      }, '*');
    }
  }, []);
  
  // Handle messages from iframe
  const handleIframeMessage = useCallback((event) => {
    console.log('Received message from iframe:', event.data);
    
    if (event.data.source === 'stretch-iframe') {
      switch (event.data.type) {
        case 'iframe-ready':
          setIsIframeReady(true);
          setAvailableExercises(event.data.data.exercises || []);
          break;
        
        case 'exercise-selected':
          setSelectedExercise(event.data.data.exercise);
          setError(null);
          break;
        
        case 'exercise-started':
          setCurrentExercise(event.data.data);
          setIsExerciseActive(true);
          setExerciseCompleted(false);
          setError(null);
          console.log('Exercise started, ready for completion');
          break;
        
        case 'exercise-completed':
          const now = Date.now();
          const timeSinceLastCompletion = now - lastCompletionRef.current.time;
          const isSameExercise = lastCompletionRef.current.exercise === selectedExercise;
          
          console.log('Exercise completed! Processing...', { 
            selectedExercise, 
            isExerciseActive, 
            exerciseCompleted, 
            timeSinceLastCompletion,
            isSameExercise,
            lastCompletionData: lastCompletionRef.current
          });
          
          // Only process if:
          // 1. Exercise is currently active
          // 2. Not already marked as completed 
          // 3. Either different exercise OR enough time has passed (3 seconds)
          const shouldProcess = isExerciseActive && 
                               !exerciseCompleted && 
                               (!isSameExercise || timeSinceLastCompletion > 3000);
          
          if (shouldProcess) {
            console.log('Processing exercise completion...');
            
            setIsExerciseActive(false);
            setExerciseCompleted(true);
            setCurrentExercise(null);
            
            // Update completion tracking
            lastCompletionRef.current = {
              time: now,
              exercise: selectedExercise
            };
            
            // Add to completed exercises (no score increment for now)
            if (selectedExercise) {
              const exerciseName = selectedExercise.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
              console.log('Adding completed exercise:', exerciseName);
              addCompletedExercise(exerciseName);
              
              // Add to session completed list for tracking
              setCompletedInSession(prev => [...prev, selectedExercise]);
              
              // Check if we need to automatically start next stretch
              const newCompletedCount = getCompletedCount() + 1; // +1 because context hasn't updated yet
              if (newCompletedCount < dailyGoal) {
                // Automatically start next stretch after a short delay
                setTimeout(() => {
                  // Select and start next exercise automatically
                  let availableChoices = [...availableExercises];
                  
                  // Avoid the just completed exercise
                  availableChoices = availableExercises.filter(ex => ex !== selectedExercise);
                  
                  // If filtering leaves us with no choices, use all exercises
                  if (availableChoices.length === 0) {
                    availableChoices = [...availableExercises];
                  }
                  
                  if (availableChoices.length > 0) {
                    const randomIndex = Math.floor(Math.random() * availableChoices.length);
                    const nextExercise = availableChoices[randomIndex];
                    
                    // Set the next exercise and notify parent
                    setSelectedExercise(nextExercise);
                    sendMessageToIframe('select-exercise', { exercise: nextExercise });
                    
                    if (onExerciseSelect) {
                      onExerciseSelect(nextExercise);
                    }
                    
                    // Start the exercise immediately
                    setTimeout(() => {
                      sendMessageToIframe('start-exercise', {});
                    }, 500);
                  }
                }, 2000); // 2 second delay to show completion briefly
              } else {
                // Clear selection when all stretches are done
                setSelectedExercise(null);
                if (onExerciseSelect) {
                  onExerciseSelect(null);
                }
              }
            } else {
              console.warn('No selected exercise to add to completed list');
            }
          } else {
            console.log('Ignoring duplicate/rapid completion message', { 
              isExerciseActive, 
              exerciseCompleted, 
              timeSinceLastCompletion,
              isSameExercise,
              reason: !isExerciseActive ? 'not active' : 
                     exerciseCompleted ? 'already completed' : 
                     'too rapid/duplicate'
            });
          }
          break;
        
        case 'exercise-reset':
          setIsExerciseActive(false);
          setExerciseCompleted(false);
          setCurrentExercise(null);
          setSelectedExercise(null);
          break;
      }
    }
  }, [selectedExercise, addCompletedExercise, isExerciseActive, exerciseCompleted, resetDailyProgress, getCompletedCount, dailyGoal, onExerciseSelect, availableExercises, sendMessageToIframe]);



  // Handle start exercise with random selection (only for initial start)
  const handleStartExercise = useCallback(() => {
    // If no exercise is selected, randomly select one
    if (!selectedExercise && availableExercises.length > 0) {
      const randomIndex = Math.floor(Math.random() * availableExercises.length);
      const randomExercise = availableExercises[randomIndex];
      
      // Set the selected exercise and notify parent
      setSelectedExercise(randomExercise);
      sendMessageToIframe('select-exercise', { exercise: randomExercise });
      
      if (onExerciseSelect) {
        onExerciseSelect(randomExercise);
      }
      
      // Start the exercise immediately after selection
      setTimeout(() => {
        sendMessageToIframe('start-exercise', {});
      }, 100);
    } else if (selectedExercise) {
      sendMessageToIframe('start-exercise', {});
    }
  }, [selectedExercise, availableExercises, sendMessageToIframe, onExerciseSelect]);

  // Handle reset exercise
  const handleResetExercise = useCallback(() => {
    sendMessageToIframe('reset-exercise', {});
    // Clear the selected exercise to show the start button again
    setSelectedExercise(null);
    if (onExerciseSelect) {
      onExerciseSelect(null);
    }
  }, [sendMessageToIframe, onExerciseSelect]);

  // Set up message listener
  useEffect(() => {
    window.addEventListener('message', handleIframeMessage);
    return () => {
      window.removeEventListener('message', handleIframeMessage);
    };
  }, [handleIframeMessage]);

  // Handle iframe load
  const handleIframeLoad = () => {
    // Iframe loaded, but we'll wait for the 'iframe-ready' message
    console.log('Stretch iframe loaded');
  };

  return (
    <Card
      title={
        <Space>
          <CameraOutlined />
          <span>Stretch Monitor</span>
        </Space>
      }
      style={{
        width: '800px', // Fixed width for camera view
        minHeight: '780px', // Minimum height to ensure camera is visible
        height: '780px', // Fixed height
        flexShrink: 0, // Don't shrink
        display: 'flex',
        flexDirection: 'column'
      }}
      bodyStyle={{
        flex: 1,
        padding: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}
    >
      {/* Exercise Controls */}
      <div style={{ padding: '16px', borderBottom: '1px solid #f0f0f0' }}>
        <Space direction="vertical" style={{ width: '100%' }}>
          {/* Exercise Controls */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'center' }}>
            {!isExerciseActive && !selectedExercise && getCompletedCount() === 0 && (
              <Button
                type="primary"
                icon={<PlayCircleOutlined />}
                onClick={handleStartExercise}
                disabled={!isIframeReady || availableExercises.length === 0}
                size="large"
                style={{ 
                  minWidth: '180px',
                  height: '48px',
                  fontSize: '16px',
                  fontWeight: '600'
                }}
              >
                Start Random Stretch
              </Button>
            )}
            
            {!isExerciseActive && !selectedExercise && getCompletedCount() > 0 && getCompletedCount() < dailyGoal && (
              <div style={{ 
                padding: '12px 24px', 
                background: '#f6ffed', 
                border: '1px solid #b7eb8f',
                borderRadius: '6px',
                textAlign: 'center'
              }}>
                <Text strong style={{ color: '#52c41a' }}>
                  Great job! Starting next stretch... ({getCompletedCount()}/{dailyGoal} completed)
                </Text>
              </div>
            )}
            
            {(isExerciseActive || selectedExercise) && (
              <>
                {selectedExercise && (
                  <div style={{ 
                    padding: '8px 16px', 
                    background: '#f0f0f0', 
                    borderRadius: '6px',
                    marginRight: '8px'
                  }}>
                    <Text strong>
                      {selectedExercise.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </Text>
                  </div>
                )}
                
                {!isExerciseActive && selectedExercise && (
                  <Button
                    type="primary"
                    icon={<PlayCircleOutlined />}
                    onClick={handleStartExercise}
                  >
                    Start
                  </Button>
                )}
                
                <Button
                  icon={<ReloadOutlined />}
                  onClick={handleResetExercise}
                  disabled={!isExerciseActive && !exerciseCompleted}
                >
                  Reset
                </Button>
              </>
            )}
            
            <Button
              type="dashed"
              onClick={() => {
                console.log('Resetting daily progress...');
                resetDailyProgress();
                setCompletedInSession([]);
                setSelectedExercise(null);
                if (onExerciseSelect) {
                  onExerciseSelect(null);
                }
              }}
              size="small"
            >
              Clear Progress
            </Button>
          </div>

          {/* Status Messages */}
          {!isIframeReady && (
            <Alert
              message="Loading stretch monitor..."
              type="info"
              showIcon
            />
          )}
          
          {error && (
            <Alert
              message={error}
              type="error"
              showIcon
            />
          )}
        </Space>
      </div>

      {/* Iframe Container */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {!isIframeReady && (
      <div style={{ 
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#fafafa',
            zIndex: 1
          }}>
            <Text type="secondary">Loading stretch monitor...</Text>
          </div>
        )}
        
        <iframe
          ref={iframeRef}
          src="/stretch-js/stretch-iframe.html"
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            borderRadius: '0 0 8px 8px'
          }}
          onLoad={handleIframeLoad}
          title="Stretch Exercise Monitor"
        />
      </div>
    </Card>
  );
};

export default StretchWebcam;