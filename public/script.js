document.addEventListener("DOMContentLoaded", () => {
  const videosContainer = document.getElementById("videos");

  // Legacy upload elements
  const fileInput = document.getElementById("video-upload");
  const fileNameDisplay = document.getElementById("file-name-display");
  const uploadForm = document.getElementById("upload-form");
  const uploadProgressContainer = document.getElementById(
    "upload-progress-container"
  );
  const uploadProgressBar = document.getElementById("upload-progress-bar");
  const uploadProgressText = document.getElementById("upload-progress-text");

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

  // Handle legacy file input change
  fileInput.addEventListener("change", () => {
    if (fileInput.files.length > 0) {
      fileNameDisplay.textContent = fileInput.files[0].name;
    } else {
      fileNameDisplay.textContent = "No file chosen";
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
        throw new Error(
          `Failed to create upload session: ${sessionResponse.statusText}`
        );
      }

      const sessionData = await sessionResponse.json();
      const { uploadId, uploadUrl } = sessionData.data;

      // Step 2: Upload using TUS
      tusUploadStatus.textContent = "Uploading...";

      const upload = new tus.Upload(file, {
        endpoint: uploadUrl,
        retryDelays: [0, 3000, 5000, 10000, 20000],
        metadata: {
          filename: file.name,
          packager: selectedPackager,
          callbackUrl: callbackUrl || "",
        },
        onError: (error) => {
          console.error("Upload failed:", error);
          tusUploadStatus.textContent = "Upload failed";
          alert(`Upload failed: ${error.message}`);
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

  // Legacy upload handler
  uploadForm.addEventListener("submit", (e) => {
    e.preventDefault();

    if (!fileInput.files.length) {
      alert("Please select a video file to upload");
      return;
    }

    const formData = new FormData();
    formData.append("video", fileInput.files[0]);

    // Add the selected packager option
    const selectedPackager = document.querySelector(
      'input[name="packager"]:checked'
    ).value;
    formData.append("packager", selectedPackager);

    const xhr = new XMLHttpRequest();

    // Show progress container
    uploadProgressContainer.style.display = "block";

    // Track upload progress
    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        const percentComplete = Math.round((event.loaded / event.total) * 100);
        uploadProgressBar.style.width = percentComplete + "%";
        uploadProgressText.textContent = percentComplete + "%";
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status === 200) {
        // Success - reset form and reload videos
        uploadForm.reset();
        fileNameDisplay.textContent = "No file chosen";
        uploadProgressContainer.style.display = "none";
        uploadProgressBar.style.width = "0%";
        uploadProgressText.textContent = "0%";

        // Reload the videos after a short delay
        setTimeout(() => {
          loadVideos();
        }, 1000);
      } else {
        // Error handling with more details
        uploadProgressContainer.style.display = "none";

        try {
          // Try to get error details if available
          const errorResponse = JSON.parse(xhr.responseText);
          const errorMessage =
            errorResponse.error || "Upload failed. Please try again.";

          if (
            errorMessage.includes("Shaka") ||
            errorMessage.includes("packager")
          ) {
            alert(
              "Error with Shaka Packager. The system will try to use FFmpeg instead. Please try again."
            );
          } else {
            alert(errorMessage);
          }
        } catch (e) {
          // Fallback error message
          alert("Upload failed. Please try again.");
        }
      }
    });

    xhr.addEventListener("error", () => {
      alert("Upload failed. Please check your connection and try again.");
      uploadProgressContainer.style.display = "none";
    });

    xhr.open("POST", "/api/v1/upload", true);
    xhr.send(formData);
  });

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
              });

              // Load the HLS source
              hls.loadSource(streamUrl);
              hls.attachMedia(videoElement);

              hls.on(Hls.Events.MANIFEST_PARSED, function (event, data) {
                console.log("Video manifest loaded:", streamUrl);

                // Create a "Start Playback" button for mobile devices
                const playButton = document.createElement("button");
                playButton.className = "play-button";
                playButton.textContent = "Play Video";
                playButton.onclick = function () {
                  videoElement.play();
                  this.style.display = "none";
                };
                playerContainer.appendChild(playButton);
              });

              hls.on(Hls.Events.ERROR, function (event, data) {
                console.warn("HLS error:", data);
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
                      break;
                  }
                }
              });
            }
            // For browsers with native HLS support
            else if (
              videoElement.canPlayType("application/vnd.apple.mpegurl")
            ) {
              videoElement.src = streamUrl;
            } else {
              console.warn("Neither HLS.js nor native HLS support available");
              const fallbackMessage = document.createElement("div");
              fallbackMessage.className = "error-message";
              fallbackMessage.textContent =
                "Your browser doesn't support HLS video playback.";
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
