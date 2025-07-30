# Vellum

A self-hostable Docker server for video processing. Features TUS direct uploads, FFmpeg-powered transcoding to streamable formats, and S3 storage. Offers optional callbacks for processing completion. Integrate video workflows effortlessly.

## Features

- **Video Streaming**: Supports HLS (HTTP Live Streaming) for adaptive bitrate streaming.
- **Multiple Packager Options**: Choose between FFmpeg or Google's Shaka Packager for HLS content.
- **Adaptive Bitrate Streaming**: Provides multiple quality levels when using Shaka Packager.
- **Quality Selection**: Interactive quality selector for videos transcoded with Shaka Packager.
- **File Uploads**: Handles file uploads with ease, including large files.
- **AWS S3 Integration**: Utilizes AWS S3 for secure and scalable storage.
- **Dockerized Environment**: Simplifies development and deployment with Docker.
- **TypeScript Support**: Ensures type safety and modern JavaScript features.

## Project Structure

```
├── app.ts
├── dev.sh
├── docker-compose.override.yml
├── docker-compose.yml
├── Dockerfile
├── Dockerfile.dev
├── package.json
├── pnpm-lock.yaml
├── prod.sh
├── README.md
├── tsconfig.json
├── controllers/
│   └── upload.Controller.ts
├── lib/
│   ├── environments.ts
│   └── s3client.ts
├── public/
│   └── index.html
├── router/
│   └── index.ts
│
└──
```

## Getting Started

### Prerequisites

- Node.js
- Docker
- AWS account (for S3 integration)

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/your-repo/streamer-sandbox.git
   ```

2. Install dependencies:

   ```bash
   pnpm install
   ```

3. Set up environment variables:
   - Create a `.env` file in the root directory.
   - Add your AWS credentials and other necessary configurations.

## Packager Options

### FFmpeg (Default)

FFmpeg is used by default to generate HLS content. It produces a basic HLS stream with segments.

### Google Shaka Packager

Shaka Packager is an advanced media packaging tool that offers:

- Multiple video qualities (low, medium, high)
- Adaptive bitrate streaming
- DASH and HLS support from the same source content
- Interactive quality selection in the player
- Better compatibility with various players and devices

When using Shaka Packager, the system will:

1. Create multiple quality renditions of your video
2. Generate both DASH and HLS manifests
3. Add quality selection controls to the player
4. Store packaging metadata for better organization

### Running the Project

#### Development

Run the development server:

```bash
./dev.sh
```

#### Production

Build and run the production server:

```bash
./prod.sh
```

#### Docker

Build and run the Docker container:

```bash
docker-compose up
```

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository.
2. Create a new branch for your feature or bug fix.
3. Submit a pull request.

## License

This project is licensed under the MIT License. See the LICENSE file for details.
