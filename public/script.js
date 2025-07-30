document.addEventListener("DOMContentLoaded", () => {
  const videosContainer = document.getElementById("videos");

  // TUS upload elements
  const tusFileInput = document.getElementById("tus-video-upload");
  const tusFileNameDisplay = document.getElementById("tus-file-name-display");
  const tusUploadForm = document.getElementById("tus-upload-form");
  const tusUploadProgressContainer = document.getElementById(
    "tus-upload-progress-container"
  );
  const tusUploadProgressBar = document.getElementById(
    "tus-upload-progress-bar"
  );
  const tusUploadProgressText = document.getElementById(
    "tus-upload-progress-text"
  );
  const tusUploadStatus = document.getElementById("tus-upload-status");
  const callbackUrlInput = document.getElementById("callback-url");

  // Handle TUS file input change
  tusFileInput.addEventListener("change", () => {
    if (tusFileInput.files.length > 0) {
      tusFileNameDisplay.textContent = tusFileInput.files[0].name;
    } else {
      tusFileNameDisplay.textContent = "No file chosen";
    }
  });

  // TUS Upload Handler
  tusUploadForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!tusFileInput.files.length) {
      alert("Please select a video file to upload");
      return;
    }

    const file = tusFileInput.files[0];
    const selectedPackager = document.querySelector(
      'input[name="tus-packager"]:checked'
    ).value;
    const callbackUrl = callbackUrlInput.value.trim();

    try {
      // Step 1: Create upload session
      tusUploadStatus.textContent = "Creating upload session...";
      tusUploadProgressContainer.style.display = "block";

      const sessionResponse = await fetch("/api/v1/video/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          filesize: file.size,
          packager: selectedPackager,
          callbackUrl: callbackUrl || undefined,
        }),
      });

      if (!sessionResponse.ok) {
        const errorData = await sessionResponse.json();
        throw new Error(
          `Failed to create upload session: ${
            errorData.message || sessionResponse.statusText
          }`
        );
      }

      const sessionData = await sessionResponse.json();
      const { uploadId } = sessionData.data;

      // Step 2: Upload using TUS
      tusUploadStatus.textContent = "Uploading...";

      const upload = new tus.Upload(file, {
        endpoint: "/api/v1/tus/files/",
        retryDelays: [0, 3000, 5000, 10000, 20000],
        metadata: {
          filename: file.name,
          packager: selectedPackager,
          uploadId: uploadId, // Pass the uploadId as metadata
        },
        onError: (error) => {
          console.error("Upload failed:", error);
          tusUploadStatus.textContent = "Upload failed";

          // Handle specific error cases
          let errorMessage = error.message;
          if (errorMessage.includes("Video record not found")) {
            errorMessage =
              "Upload session expired or invalid. Please try again.";
          } else if (errorMessage.includes("not in uploading state")) {
            errorMessage =
              "Upload session is no longer valid. Please create a new upload session.";
          }

          alert(`Upload failed: ${errorMessage}`);
          tusUploadProgressContainer.style.display = "none";
        },
        onProgress: (bytesUploaded, bytesTotal) => {
          const percentage = ((bytesUploaded / bytesTotal) * 100).toFixed(2);
          tusUploadProgressBar.style.width = percentage + "%";
          tusUploadProgressText.textContent = percentage + "%";
        },
        onSuccess: () => {
          console.log("Upload completed successfully");
          tusUploadStatus.textContent = "Upload completed! Processing...";
          tusUploadProgressBar.style.width = "100%";
          tusUploadProgressText.textContent = "100%";

          // Start polling for processing status
          pollProcessingStatus(uploadId);
        },
      });

      upload.start();
    } catch (error) {
      console.error("Error:", error);
      tusUploadStatus.textContent = "Error occurred";
      alert(`Error: ${error.message}`);
      tusUploadProgressContainer.style.display = "none";
    }
  });

  // Poll processing status
  const pollProcessingStatus = async (uploadId) => {
    try {
      const response = await fetch(`/api/v1/video/${uploadId}/status`);
      const data = await response.json();

      if (data.status === "success") {
        const video = data.data;
        tusUploadStatus.textContent = `Status: ${video.status} (${video.progress}%)`;

        if (video.status === "completed") {
          tusUploadStatus.textContent = "✅ Processing completed!";
          setTimeout(() => {
            tusUploadProgressContainer.style.display = "none";
            tusUploadForm.reset();
            tusFileNameDisplay.textContent = "No file chosen";
            loadVideos();
          }, 2000);
        } else if (video.status === "failed") {
          tusUploadStatus.textContent = `❌ Processing failed: ${video.error}`;
        } else if (video.status === "processing") {
          // Continue polling
          setTimeout(() => pollProcessingStatus(uploadId), 3000);
        }
      }
    } catch (error) {
      console.error("Error checking status:", error);
      tusUploadStatus.textContent = "Error checking status";
    }
  };

  // Check callback status function
  const checkCallbackStatus = async (videoId) => {
    try {
      const response = await fetch(`/api/v1/video/${videoId}/callback-status`);
      const data = await response.json();

      if (data.status === "success") {
        const callbackData = data.data;
        let message = `Callback Status: ${callbackData.callbackStatus.toUpperCase()}`;

        if (callbackData.callbackRetryCount > 0) {
          message += `\nRetry attempts: ${callbackData.callbackRetryCount}`;
        }

        if (callbackData.callbackLastAttempt) {
          const lastAttempt = new Date(callbackData.callbackLastAttempt);
          message += `\nLast attempt: ${lastAttempt.toLocaleString()}`;
        }

        alert(message);

        // Refresh the video list to show updated status
        loadVideos();
      } else {
        alert(`Failed to check callback status: ${data.message}`);
      }
    } catch (error) {
      console.error("Error checking callback status:", error);
      alert("Error checking callback status. Please try again.");
    }
  };

  // Create loading indicator
  const loadingIndicator = document.createElement("div");
  loadingIndicator.id = "loading";

  const spinner = document.createElement("div");
  spinner.className = "loading-spinner";

  const loadingText = document.createElement("div");
  loadingText.textContent = "Loading videos...";

  loadingIndicator.appendChild(spinner);
  loadingIndicator.appendChild(loadingText);

  // Function to load videos (updated to support new format)
  function loadVideos() {
    // Clear the container and show loading
    videosContainer.innerHTML = "";
    videosContainer.appendChild(loadingIndicator);

    // Try the new endpoint first, fall back to legacy if needed
    fetch("/api/v1/videos")
      .then((res) => {
        if (!res.ok) {
          // Fall back to legacy endpoint
          return fetch("/api/v1/upload/videos");
        }
        return res;
      })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch videos");
        return res.json();
      })
      .then((response) => {
        const videos = response.data || [];

        if (videosContainer.contains(loadingIndicator)) {
          videosContainer.removeChild(loadingIndicator);
        }

        if (!videos.length) {
          const noVideos = document.createElement("div");
          noVideos.className = "no-videos";
          noVideos.textContent = "No videos uploaded yet";
          videosContainer.appendChild(noVideos);
          return;
        }

        videos.forEach((video, index) => {
          const videoContainer = document.createElement("div");
          videoContainer.className = "video-container";

          // Create video info header
          const videoInfo = document.createElement("div");
          videoInfo.className = "video-info";

          // Add video title (support both new and legacy formats)
          const videoTitle = document.createElement("h3");
          videoTitle.textContent =
            video.filename || video.name || `Video ${index + 1}`;
          videoInfo.appendChild(videoTitle);

          // Add status info for new format
          if (video.status) {
            const statusInfo = document.createElement("div");
            statusInfo.className = "status-info";
            statusInfo.innerHTML = `<strong>Status:</strong> ${video.status}`;
            if (video.progress && video.progress < 100) {
              statusInfo.innerHTML += ` (${video.progress}%)`;
            }
            videoInfo.appendChild(statusInfo);
          }

          // Add packager info if available
          if (video.packager) {
            const packagerInfo = document.createElement("div");
            packagerInfo.className = "packager-info";
            packagerInfo.innerHTML = `<strong>Packager:</strong> ${video.packager}`;
            videoInfo.appendChild(packagerInfo);
          }

          // Add creation date if available
          const createdAt = video.createdAt || video.createdAt;
          if (createdAt) {
            const dateInfo = document.createElement("div");
            dateInfo.className = "date-info";
            const date = new Date(createdAt);
            dateInfo.innerHTML = `<strong>Created:</strong> ${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
            videoInfo.appendChild(dateInfo);
          }

          // Add error info if failed
          if (video.error) {
            const errorInfo = document.createElement("div");
            errorInfo.className = "error-info";
            errorInfo.innerHTML = `<strong>Error:</strong> ${video.error}`;
            videoInfo.appendChild(errorInfo);
          }

          // Add callback status if available
          if (video.callbackUrl) {
            const callbackInfo = document.createElement("div");
            callbackInfo.className = "callback-info";
            callbackInfo.innerHTML = `<strong>Callback URL:</strong> ${video.callbackUrl}`;

            if (video.callbackStatus) {
              const statusBadge = document.createElement("span");
              statusBadge.className = `callback-status ${video.callbackStatus}`;
              statusBadge.textContent = video.callbackStatus.toUpperCase();
              callbackInfo.appendChild(document.createElement("br"));
              callbackInfo.appendChild(document.createTextNode("Status: "));
              callbackInfo.appendChild(statusBadge);

              if (video.callbackRetryCount > 0) {
                callbackInfo.appendChild(
                  document.createTextNode(
                    ` (${video.callbackRetryCount} attempts)`
                  )
                );
              }

              // Add callback status check button
              const checkCallbackBtn = document.createElement("button");
              checkCallbackBtn.textContent = "Check Callback Status";
              checkCallbackBtn.className = "callback-check-btn";
              checkCallbackBtn.onclick = () => checkCallbackStatus(video.id);
              callbackInfo.appendChild(document.createElement("br"));
              callbackInfo.appendChild(checkCallbackBtn);
            }

            videoInfo.appendChild(callbackInfo);
          }

          videoContainer.appendChild(videoInfo);

          // Only show player if video is completed and has a stream URL
          const streamUrl = video.streamUrl || video.url;
          if (video.status === "completed" || (!video.status && streamUrl)) {
            // Create player container
            const playerContainer = document.createElement("div");
            playerContainer.className = "video-player";

            // Create video element
            const videoElement = document.createElement("video");
            videoElement.controls = true;
            videoElement.playsInline = true;
            videoElement.preload = "metadata";
            videoElement.id = `video-${index}`;

            // If HLS.js is available, use it
            if (typeof Hls !== "undefined" && Hls.isSupported()) {
              const hls = new Hls({
                maxBufferLength: 30,
                maxMaxBufferLength: 600,
                fragLoadingMaxRetry: 5,
                manifestLoadingMaxRetry: 5,
                levelLoadingMaxRetry: 5,
                debug: false,
                enableWorker: true,
                lowLatencyMode: false,
                backBufferLength: 90,
              });

              // Load the HLS source
              hls.loadSource(streamUrl);
              hls.attachMedia(videoElement);

              // Add loading indicator
              const loadingIndicator = document.createElement("div");
              loadingIndicator.className = "video-loading";
              loadingIndicator.textContent = "Loading video...";
              playerContainer.appendChild(loadingIndicator);

              hls.on(Hls.Events.MANIFEST_PARSED, function (event, data) {
                console.log("Video manifest loaded:", streamUrl);
                console.log(`Available quality levels: ${data.levels.length}`);

                // Remove loading indicator
                if (loadingIndicator.parentNode) {
                  loadingIndicator.parentNode.removeChild(loadingIndicator);
                }

                // Create quality level info
                if (data.levels.length > 1) {
                  const qualityInfo = document.createElement("div");
                  qualityInfo.className = "quality-info";
                  qualityInfo.textContent = `${data.levels.length} quality levels available`;
                  playerContainer.appendChild(qualityInfo);
                }

                // Create a "Start Playback" button for mobile devices
                const playButton = document.createElement("button");
                playButton.className = "play-button";
                playButton.textContent = "▶ Play Video";
                playButton.onclick = function () {
                  videoElement
                    .play()
                    .then(() => {
                      this.style.display = "none";
                    })
                    .catch((error) => {
                      console.warn("Autoplay failed:", error);
                      // Button will remain visible for manual play
                    });
                };
                playerContainer.appendChild(playButton);
              });

              hls.on(Hls.Events.LEVEL_SWITCHED, function (event, data) {
                console.log(`Quality switched to level ${data.level}`);
                const level = hls.levels[data.level];
                if (level) {
                  console.log(
                    `Resolution: ${level.width}x${
                      level.height
                    }, Bitrate: ${Math.round(level.bitrate / 1000)}kbps`
                  );
                }
              });

              hls.on(Hls.Events.ERROR, function (event, data) {
                console.warn("HLS error:", data);

                // Remove loading indicator on error
                if (loadingIndicator.parentNode) {
                  loadingIndicator.parentNode.removeChild(loadingIndicator);
                }

                if (data.fatal) {
                  switch (data.type) {
                    case Hls.ErrorTypes.NETWORK_ERROR:
                      console.log("Network error, trying to recover...");
                      hls.startLoad();
                      break;
                    case Hls.ErrorTypes.MEDIA_ERROR:
                      console.log("Media error, trying to recover...");
                      hls.recoverMediaError();
                      break;
                    default:
                      console.error("Fatal HLS error, cannot recover");
                      // Show error message to user
                      const errorMessage = document.createElement("div");
                      errorMessage.className = "error-message";
                      errorMessage.textContent =
                        "Video playback error. Please try refreshing the page.";
                      playerContainer.appendChild(errorMessage);
                      break;
                  }
                }
              });

              // Clean up HLS instance when video is removed
              videoElement.addEventListener("beforeunload", () => {
                if (hls) {
                  hls.destroy();
                }
              });
            }
            // For browsers with native HLS support (Safari)
            else if (
              videoElement.canPlayType("application/vnd.apple.mpegurl")
            ) {
              console.log("Using native HLS support");
              videoElement.src = streamUrl;

              // Add loading indicator for native HLS
              const loadingIndicator = document.createElement("div");
              loadingIndicator.className = "video-loading";
              loadingIndicator.textContent = "Loading video...";
              playerContainer.appendChild(loadingIndicator);

              videoElement.addEventListener("loadedmetadata", () => {
                if (loadingIndicator.parentNode) {
                  loadingIndicator.parentNode.removeChild(loadingIndicator);
                }
                console.log("Native HLS video loaded successfully");
              });

              videoElement.addEventListener("error", () => {
                if (loadingIndicator.parentNode) {
                  loadingIndicator.parentNode.removeChild(loadingIndicator);
                }
                const errorMessage = document.createElement("div");
                errorMessage.className = "error-message";
                errorMessage.textContent =
                  "Video playback error. Please check the stream URL.";
                playerContainer.appendChild(errorMessage);
              });
            } else {
              console.warn("Neither HLS.js nor native HLS support available");
              const fallbackMessage = document.createElement("div");
              fallbackMessage.className = "error-message";
              fallbackMessage.innerHTML = `
                <strong>HLS Playback Not Supported</strong><br>
                Your browser doesn't support HLS video playback.<br>
                <small>Please use a modern browser like Chrome, Firefox, Safari, or Edge.</small>
              `;
              playerContainer.appendChild(fallbackMessage);
            }

            playerContainer.appendChild(videoElement);
            videoContainer.appendChild(playerContainer);
          }

          videosContainer.appendChild(videoContainer);
        });
      })
      .catch((error) => {
        console.error("Error:", error);
        if (videosContainer.contains(loadingIndicator)) {
          videosContainer.removeChild(loadingIndicator);
        }

        const errorMessage = document.createElement("div");
        errorMessage.className = "error-message";
        errorMessage.textContent =
          "Error loading videos. Please try again later.";
        videosContainer.appendChild(errorMessage);
      });
  }

  // Initial load of videos
  loadVideos();
});
