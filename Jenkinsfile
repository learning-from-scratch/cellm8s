pipeline {
  agent any
  options {
    timestamps()
    disableConcurrentBuilds()
  }

  environment {
    IMAGE          = "simple-pet-adopt"
    TAG            = "${env.BUILD_NUMBER}"

    SONAR_HOST_URL = "http://host.docker.internal:9000"
    SONAR_LOGIN    = credentials('sonar-token')

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
        echo "Run unit tests and extract coverage"
        sh """
          set -eux
          CID=\$(docker create ${IMAGE}:${TAG} /bin/sh -lc '
            set -eux
            node -v
            npm -v
            npm test -- --coverage
          ')
          docker start -a "\$CID" || true
          rm -rf "${WORKSPACE}/coverage" || true
          docker cp "\$CID:/app/coverage" "${WORKSPACE}/coverage" || true
          docker rm "\$CID" || true
          chmod -R a+rX "${WORKSPACE}/coverage" || true
        """
      }
      post {
        always {
          script {
            if (fileExists('coverage')) {
              archiveArtifacts artifacts: 'coverage/**', fingerprint: true
            } else {
              echo 'No coverage directory found to archive'
            }
          }
        }
      }
    }

    stage('Code Quality') {
      steps {
        withCredentials([string(credentialsId: 'SONAR_TOKEN', variable: 'SONAR_TOKEN')]) {
          sh '''
            set -eux
            VOLUME_NAME=jenkins_home
            PROJECT_DIR=/var/jenkins_home/workspace/cellm8s
            docker run --rm \
              -e SONAR_HOST_URL=${SONAR_HOST_URL} \
              -e SONAR_TOKEN="${SONAR_TOKEN}" \
              -v ${VOLUME_NAME}:/var/jenkins_home \
              sonarsource/sonar-scanner-cli \
              sonar-scanner \
                -Dsonar.projectBaseDir=${PROJECT_DIR} \
                -Dsonar.login=${SONAR_TOKEN}
          '''
        }
      }
    }

    stage('Security') {
      steps {
        echo 'npm audit and Trivy scan'
        sh '''
          set -eux
          VOLUME_NAME=jenkins_home
          PROJECT_DIR=/var/jenkins_home/workspace/cellm8s
          docker run --rm \
            -v ${VOLUME_NAME}:/var/jenkins_home \
            -w ${PROJECT_DIR} \
            node:20 bash -lc 'npm ci && npm audit --json || true'
          docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
            aquasec/trivy:0.54.1 image --format table ${IMAGE}:${BUILD_NUMBER}
        '''
      }
    }

    stage('Deploy (Staging)') {
      steps {
        echo "Deploying to staging (port 3001)"
        sh '''
          set -eux
          for i in $(seq 1 30); do
            code=$(curl -s -o /dev/null -w "%{http_code}" http://host.docker.internal:3001/health || true)
            if [ "$code" = "200" ]; then
              echo "Healthcheck passed"
              exit 0
            fi
            echo "Waiting for app... (HTTP $code)"
            sleep 2
          done
          echo "Healthcheck failed"
          docker logs cellm8s-web-staging-1 || true
          exit 1
        '''
      }
    }

    stage('Release (Promote to Prod)') {
      steps {
        echo "Deploying to production (port 3000)"
        sh '''
          set -eux
          : "${IMAGE:=simple-pet-adopt}"
          : "${TAG:=latest}"
          export COMPOSE_PROJECT_NAME=cellm8s

          docker tag "$IMAGE:$TAG" "$IMAGE:prod"
          CID=$(docker ps -q --filter "publish=3000" || true)
          if [ -n "$CID" ]; then docker rm -f $CID || true; fi
          docker-compose -f docker-compose.yml -p "$COMPOSE_PROJECT_NAME" rm -fs web-prod || true
          docker-compose -f docker-compose.yml -p "$COMPOSE_PROJECT_NAME" up -d --force-recreate web-prod

          for i in $(seq 1 30); do
            code=$(curl -s -o /dev/null -w "%{http_code}" http://host.docker.internal:3000/health || true)
            [ "$code" = "200" ] && { echo "Prod healthy"; ok=1; break; }
            echo "Waiting for prod... (HTTP ${code:-none})"
            sleep 2
          done
          [ "${ok:-}" = "1" ] || { echo "Prod failed healthcheck"; docker logs ${COMPOSE_PROJECT_NAME}-web-prod-1 || true; exit 1; }

          git tag -a "v1.${BUILD_NUMBER}" -m "release v1.${BUILD_NUMBER}" || true
        '''
      }
    }

    stage('Monitoring & Alerting') {
      steps {
        echo "Start Uptime Kuma and verify endpoints"
        sh '''
          docker-compose -f docker-compose.yml up -d uptime-kuma || true
          curl -fsS http://host.docker.internal:3000/health
          curl -fsS http://host.docker.internal:3001/health
        '''
      }
    }
  }

  post {
    success { echo "✅ All good. Staging :3001, Prod :3000, Sonar :9000, Kuma :3002" }
    failure { echo "❌ Something failed. Check logs for details." }
  }
}
