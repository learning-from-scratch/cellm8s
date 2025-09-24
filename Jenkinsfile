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

    // >>> Set your recipients here (comma-separated)
    EMAIL_TO       = "you@example.com, team@example.com"
  }

  stages {

    stage('Build') {
      steps {
        sh 'mkdir -p logs'
        echo "Building Docker image ${IMAGE}:${TAG}"
        // Capture all output to logs/build.log
        sh '''
          set -eux
          {
            docker build -t "$IMAGE:$TAG" .
            docker tag "$IMAGE:$TAG" "$IMAGE:latest"
          } 2>&1 | tee -a logs/build.log
        '''
      }
      post {
        always {
          archiveArtifacts artifacts: 'logs/build.log', fingerprint: true
        }
        failure {
          emailext(
            to: env.EMAIL_TO,
            subject: "[Jenkins][${env.JOB_NAME} #${env.BUILD_NUMBER}] Build stage FAILED",
            body: """\
Build failed for ${env.JOB_NAME} #${env.BUILD_NUMBER}.
Job: ${env.BUILD_URL}
""",
            attachmentsPattern: 'logs/build.log'
          )
        }
      }
    }

    stage('Test') {
      steps {
        sh 'mkdir -p logs'
        echo "Run unit tests and extract coverage"
        sh """
          set -eux
          {
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
          } 2>&1 | tee -a logs/test.log
        """
      }
      post {
        always {
          archiveArtifacts artifacts: 'logs/test.log, coverage/**', fingerprint: true
        }
        failure {
          emailext(
            to: env.EMAIL_TO,
            subject: "[Jenkins][${env.JOB_NAME} #${env.BUILD_NUMBER}] Test stage FAILED",
            body: """\
Tests failed for ${env.JOB_NAME} #${env.BUILD_NUMBER}.
Job: ${env.BUILD_URL}
""",
            attachmentsPattern: 'logs/test.log'
          )
        }
      }
    }

    stage('Code Quality') {
      steps {
        sh 'mkdir -p logs'
        withCredentials([string(credentialsId: 'SONAR_TOKEN', variable: 'SONAR_TOKEN')]) {
          sh '''
            set -eux
            {
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
            } 2>&1 | tee -a logs/sonar.log
          '''
        }
      }
      post {
        always {
          archiveArtifacts artifacts: 'logs/sonar.log', fingerprint: true
        }
        failure {
          emailext(
            to: env.EMAIL_TO,
            subject: "[Jenkins][${env.JOB_NAME} #${env.BUILD_NUMBER}] Code Quality stage FAILED",
            body: """\
Sonar analysis failed for ${env.JOB_NAME} #${env.BUILD_NUMBER}.
Job: ${env.BUILD_URL}
""",
            attachmentsPattern: 'logs/sonar.log'
          )
        }
      }
    }

    stage('Security') {
      steps {
        sh 'mkdir -p logs'
        echo 'npm audit and Trivy scan'
        sh '''
          set -eux
          {
            VOLUME_NAME=jenkins_home
            PROJECT_DIR=/var/jenkins_home/workspace/cellm8s
            docker run --rm \
              -v ${VOLUME_NAME}:/var/jenkins_home \
              -w ${PROJECT_DIR} \
              node:20 bash -lc 'npm ci && npm audit --json || true'
            docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
              aquasec/trivy:0.54.1 image --format table ${IMAGE}:${BUILD_NUMBER}
          } 2>&1 | tee -a logs/security.log
        '''
      }
      post {
        always {
          archiveArtifacts artifacts: 'logs/security.log', fingerprint: true
        }
        failure {
          emailext(
            to: env.EMAIL_TO,
            subject: "[Jenkins][${env.JOB_NAME} #${env.BUILD_NUMBER}] Security stage FAILED",
            body: """\
Security checks failed for ${env.JOB_NAME} #${env.BUILD_NUMBER}.
Job: ${env.BUILD_URL}
""",
            attachmentsPattern: 'logs/security.log'
          )
        }
      }
    }

    stage('Deploy (Staging)') {
      steps {
        sh 'mkdir -p logs'
        sh '''
          set -eux
          {
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
          } 2>&1 | tee -a logs/staging.log
        '''
      }
      post {
        always {
          archiveArtifacts artifacts: 'logs/staging.log', fingerprint: true
        }
        failure {
          emailext(
            to: env.EMAIL_TO,
            subject: "[Jenkins][${env.JOB_NAME} #${env.BUILD_NUMBER}] Staging deploy FAILED",
            body: """\
Staging failed for ${env.JOB_NAME} #${env.BUILD_NUMBER}.
Job: ${env.BUILD_URL}
""",
            attachmentsPattern: 'logs/staging.log'
          )
        }
      }
    }

    stage('Release (Promote to Prod)') {
      steps {
        sh 'mkdir -p logs'
        sh '''
          set -eux
          {
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
          } 2>&1 | tee -a logs/release.log
        '''
      }
      post {
        always {
          archiveArtifacts artifacts: 'logs/release.log', fingerprint: true
        }
        failure {
          emailext(
            to: env.EMAIL_TO,
            subject: "[Jenkins][${env.JOB_NAME} #${env.BUILD_NUMBER}] Release to PROD FAILED",
            body: """\
Release (Prod) failed for ${env.JOB_NAME} #${env.BUILD_NUMBER}.
Job: ${env.BUILD_URL}
""",
            attachmentsPattern: 'logs/release.log'
          )
        }
      }
    }

    stage('Monitoring & Alerting') {
      steps {
        sh 'mkdir -p logs'
        sh '''
          set -eux
          {
            docker-compose -f docker-compose.yml up -d uptime-kuma || true
            curl -fsS http://host.docker.internal:3000/health
            curl -fsS http://host.docker.internal:3001/health
          } 2>&1 | tee -a logs/monitoring.log
        '''
      }
      post {
        always {
          archiveArtifacts artifacts: 'logs/monitoring.log', fingerprint: true
        }
      }
    }
  }

  post {
    success {
      emailext(
        to: env.EMAIL_TO,
        subject: "[Jenkins][${env.JOB_NAME} #${env.BUILD_NUMBER}] ✅ SUCCESS",
        body: """\
Pipeline finished successfully.

Job: ${env.BUILD_URL}
Staging: http://host.docker.internal:3001/health
Prod:    http://host.docker.internal:3000/health
Sonar:   http://host.docker.internal:9000
Kuma:    http://host.docker.internal:3002
""",
        // Attach the full console log only on success if you want it (optional):
        // attachLog: true
      )
    }
    failure {
      emailext(
        to: env.EMAIL_TO,
        subject: "[Jenkins][${env.JOB_NAME} #${env.BUILD_NUMBER}] ❌ FAILURE",
        body: """\
Pipeline failed.

Job: ${env.BUILD_URL}

See attached full console log for details.
""",
        attachLog: true
      )
    }
  }
}
