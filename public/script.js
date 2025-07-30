document.addEventListener("DOMContentLoaded", () => {
  const videosContainer = document.getElementById("videos");
  const fileInput = document.getElementById("video-upload");
  const fileNameDisplay = document.getElementById("file-name-display");
  const uploadForm = document.getElementById("upload-form");
  const uploadProgressContainer = document.getElementById(
    "upload-progress-container"
  );
  const uploadProgressBar = document.getElementById("upload-progress-bar");
  const uploadProgressText = document.getElementById("upload-progress-text");

  // Handle file input change
  fileInput.addEventListener("change", () => {
    if (fileInput.files.length > 0) {
      fileNameDisplay.textContent = fileInput.files[0].name;
    } else {
      fileNameDisplay.textContent = "No file chosen";
    }
  });

  // Handle form submission with progress tracking
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

  // Function to load videos
  function loadVideos() {
    // Clear the container and show loading
    videosContainer.innerHTML = "";
    videosContainer.appendChild(loadingIndicator);

    fetch("/api/v1/videos")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch videos");
        return res.json();
      })
      .then((videos) => {
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

          // Add video title
          const videoTitle = document.createElement("h3");
          videoTitle.textContent = video.name || `Video ${index + 1}`;
          videoInfo.appendChild(videoTitle);

          // Add packager info if available
          if (video.packager) {
            const packagerInfo = document.createElement("div");
            packagerInfo.className = "packager-info";
            packagerInfo.innerHTML = `<strong>Packager:</strong> ${video.packager}`;
            videoInfo.appendChild(packagerInfo);
          }

          // Add creation date if available
          if (video.createdAt) {
            const dateInfo = document.createElement("div");
            dateInfo.className = "date-info";
            const date = new Date(video.createdAt);
            dateInfo.innerHTML = `<strong>Created:</strong> ${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
            videoInfo.appendChild(dateInfo);
          }

          videoContainer.appendChild(videoInfo);

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
              // Additional configuration for better compatibility with different packagers
              fragLoadingMaxRetry: 5,
              manifestLoadingMaxRetry: 5,
              levelLoadingMaxRetry: 5,
              debug: false,
            });

            // Load the HLS source
            hls.loadSource(video.url);
            hls.attachMedia(videoElement);

            hls.on(Hls.Events.MANIFEST_PARSED, function (event, data) {
              // Video ready to be played
              console.log("Video manifest loaded:", video.url);

              // Create a "Start Playback" button for mobile devices
              const playButton = document.createElement("button");
              playButton.className = "play-button";
              playButton.textContent = "Play Video";
              playButton.onclick = function () {
                videoElement.play();
                this.style.display = "none";
              };
              playerContainer.appendChild(playButton);

              // If this video was packaged with Shaka, add quality selector
              if (
                video.packager === "shaka" &&
                data.levels &&
                data.levels.length > 1
              ) {
                // Create quality selector
                const qualitySelector = document.createElement("div");
                qualitySelector.className = "quality-selector";

                const qualityLabel = document.createElement("span");
                qualityLabel.textContent = "Quality:";
                qualitySelector.appendChild(qualityLabel);

                const qualityDropdown = document.createElement("select");

                // Add auto option
                const autoOption = document.createElement("option");
                autoOption.value = "-1";
                autoOption.textContent = "Auto";
                autoOption.selected = true;
                qualityDropdown.appendChild(autoOption);

                // Add quality options
                data.levels.forEach((level, index) => {
                  const option = document.createElement("option");
                  option.value = index.toString();
                  option.textContent = `${level.height}p`;
                  qualityDropdown.appendChild(option);
                });

                // Add change handler for quality selection
                qualityDropdown.addEventListener("change", (e) => {
                  hls.currentLevel = parseInt(e.target.value);
                });

                qualitySelector.appendChild(qualityDropdown);
                playerContainer.appendChild(qualitySelector);
              }
            });

            // Handle HLS.js errors
            hls.on(Hls.Events.ERROR, function (event, data) {
              console.warn("HLS error:", data);

              // Add recovery logic for HLS errors
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
          else if (videoElement.canPlayType("application/vnd.apple.mpegurl")) {
            videoElement.src = video.url;
          } else {
            console.warn("Neither HLS.js nor native HLS support available");
            // Create a fallback message
            const fallbackMessage = document.createElement("div");
            fallbackMessage.className = "error-message";
            fallbackMessage.textContent =
              "Your browser doesn't support HLS video playback.";
            playerContainer.appendChild(fallbackMessage);
          }

          playerContainer.appendChild(videoElement);
          videoContainer.appendChild(playerContainer);
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
