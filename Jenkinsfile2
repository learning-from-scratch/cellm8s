// Prereqs on the Jenkins agent: Docker + Docker Compose, Node.js 20+ (for npm, npx)
// Create a Secret Text credential in Jenkins named 'sonar-token' for SonarQube auth.

pipeline {
  agent any
  options {
    timestamps()
    disableConcurrentBuilds()
  }
  environment {
    IMAGE          = "simple-pet-adopt"
    TAG            = "${env.BUILD_NUMBER}"
    SONAR_HOST_URL = "http://localhost:9000"
    SONAR_LOGIN    = credentials('sonar-token') // Jenkins > Manage Credentials
    // Defaults for app containers
    APP_USER       = "admin"
    APP_PASS       = "admin123"
    SESSION_SECRET = "change_me_in_jenkins"
  }

  stages {

    stage('Build') {
      steps {
        echo "Building Docker image ${IMAGE}:${TAG}"
        sh 'docker build -t $IMAGE:$TAG .'
        sh 'docker tag $IMAGE:$TAG $IMAGE:latest'
      }
    }

    stage('Test') {
      steps {
         echo "Installing deps and running unit tests"
         sh '''
            docker run --rm -v "$PWD:/app" -w /app node:20 \
            bash -lc "npm ci && npm test -- --coverage"
         '''
         # archive coverage if you want
      }
      post {
         always {
            archiveArtifacts artifacts: 'coverage/**', fingerprint: true
         }
      }
   }

    stage('Code Quality') {
      steps {
        echo "Starting SonarQube (Docker Compose) and running scanner"
        sh '''
          docker compose up -d sonarqube
          # give SonarQube a moment to boot the first time
          sleep 25
          npx sonar-scanner \
            -Dsonar.host.url=$SONAR_HOST_URL \
            -Dsonar.login=$SONAR_LOGIN
        '''
      }
    }

    stage('Security') {
      steps {
        echo "Dependency audit and container scan"
        // npm audit fails on advisories by design; do not fail the whole pipeline automatically.
        sh 'npm audit --json || true'
        // Trivy exits 0 so the stage passes; tighten to --exit-code 1 if you want to gate on severity.
        sh 'docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy:0.54.1 image --format table $IMAGE:$TAG || true'
      }
    }

    stage('Deploy (Staging)') {
      steps {
        echo "Deploying to staging (port 3001)"
        sh '''
          TAG=staging \
          APP_USER=$APP_USER APP_PASS=$APP_PASS SESSION_SECRET=$SESSION_SECRET \
          docker compose up -d --build web-staging
          # Smoke test
          curl -fsS http://localhost:3001/health
        '''
      }
    }

    stage('Release (Promote to Prod)') {
      steps {
        echo "Promoting image to prod (port 3000)"
        sh '''
          docker tag $IMAGE:$TAG $IMAGE:prod
          TAG=latest \
          APP_USER=$APP_USER APP_PASS=$APP_PASS SESSION_SECRET=$SESSION_SECRET \
          docker compose up -d web-prod
          # Prod health check
          curl -fsS http://localhost:3000/health
          # Lightweight git tag for traceability (ignore if workspace isn't a git repo)
          git tag -a "v1.${BUILD_NUMBER}" -m "release v1.${BUILD_NUMBER}" || true
        '''
      }
    }

    stage('Monitoring & Alerting') {
      steps {
        echo "Bringing up Uptime Kuma and verifying target endpoints"
        sh '''
          docker compose up -d uptime-kuma
          # confirm the app endpoints are healthy right now
          curl -fsS http://localhost:3000/health
          curl -fsS http://localhost:3001/health
        '''
        echo "Open Kuma at http://localhost:3002 to add monitors for /health (manual once-off)."
      }
    }
  }

  post {
    success {
      echo "Pipeline OK. Staging: :3001, Prod: :3000, SonarQube: :9000, Uptime Kuma: :3002"
      // Configure Mailer or Email Ext if you want emails. Example:
      // emailext to: 'you@example.com',
      //   subject: "OK #${env.BUILD_NUMBER} ${env.JOB_NAME}",
      //   body: "Deployed v1.${env.BUILD_NUMBER}. Staging :3001, Prod :3000"
    }
    failure {
      echo "Pipeline FAILED. See console output for the faceplant."
      // emailext to: 'you@example.com',
      //   subject: "FAILED #${env.BUILD_NUMBER} ${env.JOB_NAME}",
      //   body: "Build URL: ${env.BUILD_URL}"
    }
    always {
      // Optional cleanup hook if you tend to leave zombies everywhere:
      echo "Disk usage snapshot (optional)"
      sh 'docker images --format "{{.Repository}}:{{.Tag}}\t{{.Size}}" | sort || true'
    }
  }
}
