pipeline {
  agent any
  options { timestamps(); disableConcurrentBuilds() }

  environment {
    IMAGE          = "simple-pet-adopt"
    TAG            = "${env.BUILD_NUMBER}"

    // IMPORTANT: from inside the Jenkins container, "localhost" is NOT the host.
    // Use host.docker.internal to reach the SonarQube port that Docker Desktop exposes.
    SONAR_HOST_URL = "http://host.docker.internal:9000"
    SONAR_LOGIN    = credentials('sonar-token')  // Jenkins > Credentials (Secret text)

    APP_USER       = "admin"
    APP_PASS       = "admin123"
    SESSION_SECRET = "change_me_in_jenkins"
  }

  stages {

    stage('Build') {
      steps {
        echo "Building Docker image ${IMAGE}:${TAG}"
        sh '''
          docker build -t $IMAGE:$TAG .
          docker tag $IMAGE:$TAG $IMAGE:latest
        '''
      }
    }

    stage('Test') {
      steps {
        echo "Installing deps and running unit tests inside Node 20 container"
        sh '''
          docker run --rm -v "$PWD:/app" -w /app node:20 \
            bash -lc "npm ci && npm test -- --coverage"
        '''
      }
      post {
        always {
          // archive coverage if you want it in Jenkins artifacts
          archiveArtifacts artifacts: 'coverage/**', fingerprint: true
        }
      }
    }

    stage('Code Quality') {
      steps {
        echo "Running SonarQube scan via npx (Node 20 container)"
        sh '''
          # assume SonarQube is already running on host port 9000
          docker run --rm -v "$PWD:/app" -w /app \
            -e SONAR_HOST_URL=$SONAR_HOST_URL -e SONAR_LOGIN=$SONAR_LOGIN \
            node:20 bash -lc "npx --yes sonar-scanner -Dsonar.host.url=$SONAR_HOST_URL -Dsonar.login=$SONAR_LOGIN"
        '''
      }
    }

    stage('Security') {
      steps {
        echo "npm audit (deps) and Trivy (image) scans"
        sh '''
          docker run --rm -v "$PWD:/app" -w /app node:20 \
            bash -lc "npm ci && npm audit --json || true"

          docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
            aquasec/trivy:0.54.1 image --format table $IMAGE:$TAG || true
        '''
      }
    }

    stage('Deploy (Staging)') {
      steps {
        echo "Deploying to staging with docker-compose (port 3001)"
        sh '''
          # bring up SonarKuma/etc elsewhere if you want; here we just run the app
          docker-compose -f docker-compose.yml up -d --build web-staging
          curl -fsS http://host.docker.internal:3001/health
        '''
      }
    }

    stage('Release (Promote to Prod)') {
      steps {
        echo "Promoting to prod (port 3000)"
        sh '''
          docker tag $IMAGE:$TAG $IMAGE:prod
          docker-compose -f docker-compose.yml up -d web-prod
          curl -fsS http://host.docker.internal:3000/health
          git tag -a "v1.${BUILD_NUMBER}" -m "release v1.${BUILD_NUMBER}" || true
        '''
      }
    }

    stage('Monitoring & Alerting') {
      steps {
        echo "Starting Uptime Kuma (once) and verifying endpoints"
        sh '''
          docker-compose -f docker-compose.yml up -d uptime-kuma || true
          curl -fsS http://host.docker.internal:3000/health
          curl -fsS http://host.docker.internal:3001/health
        '''
        echo 'Open Uptime Kuma at http://localhost:3002 and add GET monitors for /health.'
      }
    }
  }

  post {
    success {
      echo "Pipeline OK. Staging :3001, Prod :3000, SonarQube :9000, Kuma :3002"
    }
    failure {
      echo "Pipeline FAILED. Check the stage that faceplanted in Console Output."
    }
  }
}
