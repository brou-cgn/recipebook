#!/bin/bash
set -e

echo "🔧 Configuring Firebase Storage CORS..."

# gcloud storage replaces gsutil (Tech-Check B4)
if ! command -v gcloud &> /dev/null
then
    echo "❌ gcloud not found. Please install Google Cloud SDK"
    echo "   https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Determine bucket from Firebase project
BUCKET="gs://broubook.firebasestorage.app"
echo "📦 Bucket: $BUCKET"

# Apply CORS configuration
echo "⚙️  Applying CORS configuration..."
gcloud storage buckets update "$BUCKET" --cors-file=storage-cors.json

# Verify
echo "✅ Verifying configuration..."
gcloud storage buckets describe "$BUCKET" --format="default(cors_config)"

echo "✅ CORS configuration applied successfully!"
