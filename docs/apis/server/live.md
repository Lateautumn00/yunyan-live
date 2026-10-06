# 直播接口 `/live/liveInfo`

控制器：`apps/server/src/live/live.controller.ts` → 转发到 `live-service`（gRPC ：50052），部分接口同时调 `auth-service` 解析用户名。

所有成功响应均包裹为 `{ code: 1000, msg: "success", data }`，下文仅列出 `data` 结构。

## 状态说明

`status`（房间状态）：1=未开播（已创建），2=直播中，3=已结束，4=暂停。`type`：直播类型。`record_type`（录制类型）：1=直播录制，2=回放链接。

## 1. 创建直播间

`POST /live/liveInfo/createLive`

需要 JWT（创建者即主播，通过 gRPC metadata `user-id` 传递）。

**请求体：**

| 字段      | 类型   | 必填 | 校验                                    |
| --------- | ------ | ---- | --------------------------------------- |
| title     | string | 是   | 长度 1-200                              |
| type      | number | 否   | 直播类型，默认 0                        |
| startTime | string | 是   | Unix 毫秒时间戳字符串，不能早于当前时间 |
| duration  | number | 否   | 时长（分钟），默认 0                    |
| roomId    | string | 否   | 复用已存在房间 ID（默认新建）           |

**响应 data：** 房间信息（见下方「房间数据结构」）。

## 2. 修改直播信息

`PUT /live/liveInfo/updateLive`

需要 JWT。

**请求体：**

| 字段      | 类型   | 必填 | 校验                  |
| --------- | ------ | ---- | --------------------- |
| roomId    | string | 是   | 房间 ID               |
| title     | string | 否   | 长度 1-200            |
| type      | number | 否   | 直播类型              |
| startTime | string | 否   | Unix 毫秒时间戳字符串 |
| duration  | number | 否   | 时长（分钟）          |

## 3. 加入直播（参加码）

`POST /live/liveInfo/joinLive`

需要 JWT（当前用户作为 liveUserId 加入）。

**请求体：**

| 字段     | 类型   | 必填 | 校验                   |
| -------- | ------ | ---- | ---------------------- |
| joinCode | string | 是   | 房间参加码             |
| nickName | string | 否   | 昵称（当前实现未使用） |

**响应 data：** gRPC `JoinLiveResponse.data`，含 `live_user_id/room_id/role_name/join_code/live_type/status`。

## 4. 查看房间信息

`GET /live/liveInfo/showRoomInfo?roomId=xxx`

无需鉴权。

**响应 data：**

| 字段          | 类型   | 说明                               |
| ------------- | ------ | ---------------------------------- |
| roomId        | string | 房间 ID                            |
| title         | string | 标题                               |
| speakerName   | string | 主播用户名（从 auth-service 解析） |
| liveUserId    | string | 主播用户 ID                        |
| joinCode      | string | 参加码                             |
| status        | number | 1/2/3/4                            |
| type          | number | 直播类型                           |
| videoList     | array  | 当前恒为 `[]`                      |
| liveStartedAt | string | 开播时间（缺省为当前时间戳）       |

## 5. 修改房间状态

`PUT /live/liveInfo/changeLiveStatus`

需要 JWT。

**请求体：**

| 字段   | 类型   | 必填 | 校验    |
| ------ | ------ | ---- | ------- |
| roomId | string | 是   | 房间 ID |
| status | number | 是   | 1/2/3/4 |

## 6. 直播间列表（CMS / 老师视角）

`POST /live/liveInfo/cmsLiveList`

需要 JWT。按当前登录用户过滤（仅返回其名下房间）。

**请求体：**

| 字段       | 类型   | 必填 | 校验                        |
| ---------- | ------ | ---- | --------------------------- |
| page       | number | 否   | 页码，默认 1                |
| pageSize   | number | 否   | 每页数量，默认 10           |
| status     | number | 否   | 按状态过滤                  |
| searchName | string | 否   | 标题模糊搜索                |
| startTime  | string | 否   | 开始时间过滤                |
| endTime    | string | 否   | 结束时间过滤                |
| type       | number | 否   | 直播类型，默认 -1（不过滤） |

**响应 data：**

| 字段  | 类型   | 说明               |
| ----- | ------ | ------------------ |
| list  | 数组   | 见「列表房间结构」 |
| total | number | 总条数             |

**列表房间结构：** `roomId, title, speakerName 为 null, joinCode, status, type, startTime, duration`。

## 7. 直播间详情（CMS）

`GET /live/liveInfo/cmsLiveDetail?roomId=xxx`

需要 JWT。

**响应 data：** `roomId, title, speakerName, joinCode, status, type, startTime, duration`。

## 8. 删除直播间

`DELETE /live/liveInfo/deleteLive`

需要 JWT。

**请求体：** `roomId`（必填）。

**响应 data：** `{ "msg": "删除成功" }`。

## 9. 刷新参加码

`PUT /live/liveInfo/updateLiveCode`

需要 JWT。

**请求体：**

| 字段        | 类型   | 必填 | 校验                                     |
| ----------- | ------ | ---- | ---------------------------------------- |
| roomId      | string | 是   | 房间 ID                                  |
| operateType | string | 否   | 操作类型（如 `refresh`），当前实现未使用 |

**响应 data：** 直接返回新的 `join_code` 字符串。

## 10. 学生视角房间列表

`GET /live/liveInfo/studentRooms?page=1&pageSize=10`

需要 JWT。按当前登录用户作为参与者过滤。

**响应 data：**

| 字段  | 类型   | 说明                                                                             |
| ----- | ------ | -------------------------------------------------------------------------------- |
| list  | 数组   | 每项 `roomId, title, speakerName, liveUserId, joinCode, status, startTime, type` |
| total | number | 总条数                                                                           |

## 11. 离开房间

`DELETE /live/liveInfo/leave`

需要 JWT（当前用户作为离开者）。

**请求体：** `roomId`（必填）。

## 12. 批量离开房间

`DELETE /live/liveInfo/batchLeave`

需要 JWT。

**请求体：**

| 字段    | 类型     | 必填 | 说明         |
| ------- | -------- | ---- | ------------ |
| roomIds | string[] | 是   | 房间 ID 数组 |

## 14. 生成房间转移码

`POST /live/liveInfo/generateTransferCode`

需要 JWT（当前用户为目标接收者 target_user_id）。

**请求体：** `roomId`（必填）。

**响应 data：** `code, msg, transfer_code, expires_at`。

## 15. 执行房间转移

`POST /live/liveInfo/executeTransfer`

需要 JWT（当前用户为转出者 from_user_id）。

**请求体：**

| 字段         | 类型   | 必填 | 说明    |
| ------------ | ------ | ---- | ------- |
| roomId       | string | 是   | 房间 ID |
| transferCode | string | 是   | 转移码  |

## 16. 搜索老师

`GET /live/liveInfo/searchTeachers?keyword=xxx`

需要 JWT。转发到 auth-service 的 `SearchTeachers`。

**响应 data：** 用户数组（`id, username, email, role`）。

## 18. 录制列表（回放）

`GET /live/liveInfo/videoList?page=1&pageSize=10&searchName=&startTime=&endTime=&type=`

需要 JWT。按当前登录用户（live_user_id）过滤。

**查询参数：**

| 字段       | 类型   | 说明                             |
| ---------- | ------ | -------------------------------- |
| page       | string | 页码，默认 1                     |
| pageSize   | string | 每页数量，默认 10                |
| searchName | string | 标题模糊搜索                     |
| startTime  | string | 开始时间                         |
| endTime    | string | 结束时间                         |
| type       | string | 直播类型（>=0 生效，否则不过滤） |

**响应 data：**

| 字段     | 类型 | 说明                                                 |
| -------- | ---- | ---------------------------------------------------- |
| list     | 数组 | 每项 `roomId, title, speakerName, type, time, count` |
| pageInfo | 对象 | `{ totalElements }`                                  |

## 19. 录制详情

`GET /live/liveInfo/videoDetail?roomId=xxx&startTime=&endTime=`

需要 JWT。

**响应 data：**

| 字段     | 类型 | 说明                                                                              |
| -------- | ---- | --------------------------------------------------------------------------------- |
| list     | 数组 | 每项 `roomId, id, address(file_path), duration, createTime, recordType, filePath` |
| pageInfo | 对象 | `{ totalElements }`                                                               |

## 20. 按房间批量删除录制

`DELETE /live/liveInfo/deleteVideo`

需要 JWT。

**请求体：**

| 字段    | 类型     | 必填 | 说明         |
| ------- | -------- | ---- | ------------ |
| roomIds | string[] | 是   | 房间 ID 数组 |

## 21. 按视频 ID 批量删除录制

`DELETE /live/liveInfo/deleteVideoByIds`

需要 JWT。

**请求体：**

| 字段     | 类型     | 必填 | 说明             |
| -------- | -------- | ---- | ---------------- |
| videoIds | string[] | 是   | 录制记录 ID 数组 |

## 22. 保存回放地址

`POST /live/liveInfo/savePlayBackUrl`

需要 JWT。内部复用 `SaveVideoRecording` 且 `record_type=2`。

**请求体：**

| 字段        | 类型   | 必填 | 说明               |
| ----------- | ------ | ---- | ------------------ |
| roomId      | string | 是   | 房间 ID            |
| playBackUrl | string | 是   | 回放地址           |
| duration    | number | 否   | 时长（秒），默认 0 |

**响应 data：** `{ roomId, playBackUrl }`。

## 24. 观看时长统计

`POST /live/liveInfo/getUserWatchTimeList`

需要 JWT。

**请求体：**

| 字段       | 类型   | 必填 | 说明              |
| ---------- | ------ | ---- | ----------------- |
| pageNum    | number | 否   | 页码，默认 1      |
| pageSize   | number | 否   | 每页数量，默认 10 |
| roomId     | string | 否   | 房间 ID 过滤      |
| searchName | string | 否   | 搜索关键字        |

**响应 data：**

| 字段     | 类型 | 说明                                                               |
| -------- | ---- | ------------------------------------------------------------------ |
| list     | 数组 | 每项 `userId, nickName, watchTime(秒), joinedAt, leftAt, isOnline` |
| other    | 对象 | `{ totalTimeByRoomId }`                                            |
| pageInfo | 对象 | `{ totalElements }`                                                |

## 25. 下载 / 转码录制文件

`GET /live/liveInfo/downloadRecording/:id?download=true`

需要 JWT。`:id` 为录制记录 ID 对应的文件名前缀。

**查询参数：**

| 字段     | 类型   | 说明                                           |
| -------- | ------ | ---------------------------------------------- |
| download | string | `true` 时下载 mp4；缺省时触发转码/查询转码状态 |

**行为说明：**

- `download=true`：mp4 已就绪 → 以 `video/mp4` 附件形式返回文件流；未就绪 → `{ code: 2002, msg: "转码中，请稍后" }`。
- 缺省（触发转码）：mp4 已存在 → `{ code: 1000, msg: "转码完成" }`；正在转码（存在 marker）→ `{ code: 2002, msg: "转码中，请稍后" }`；否则后台 `docker exec` 调用 `janus-pp-rec` + `ffmpeg` 转码后返回 `{ code: 2002, msg: "转码中，请稍后" }`。
- 视频源文件不存在 → HTTP 404 `{ code: 404, msg: "录制文件不存在" }`。
- 依赖环境变量：`RECORDINGS_DIR`（默认 `/home/janus/recordings`）、`JANUS_CONTAINER`（默认 `janus-gateway`）、`JANUS_PP_REC`（默认 `/opt/janus/bin/janus-pp-rec`）。

## 26. 保存课件（进房前上传登记）

`POST /live/liveInfo/saveCourseware`

需要 JWT。教师在进房前（直播列表「上传课件」/ 直播概况页）上传 PPT 后登记到服务端课件表；教室内上传白板课件成功后也会调用同一接口。进房时按 `fileUrl` 去重后自动导入白板。

**请求体：**

| 字段     | 类型   | 必填 | 说明                                             |
| -------- | ------ | ---- | ------------------------------------------------ |
| roomId   | string | 是   | 房间 ID                                          |
| filename | string | 是   | 文件名（不含扩展名）                             |
| filext   | string | 否   | 扩展名，如 `pptx`                                |
| filesize | number | 否   | 文件字节数                                       |
| fileUrl  | string | 是   | LibreOffice 转换后的 PDF 地址（导入/去重关联键） |

**响应 data：** `null`（`{ code: 1000 }` 即成功）

## 27. 课件列表

`GET /live/liveInfo/coursewareList?roomId=xxx`

需要 JWT。按创建时间升序返回该房间的课件，供教师端进房自动导入。

**响应 data：**

| 字段     | 类型 | 说明                                                              |
| -------- | ---- | ----------------------------------------------------------------- |
| list     | 数组 | 每项 `id, roomId, filename, filext, filesize, fileUrl, createdAt` |
| pageInfo | 对象 | `{ totalElements }`                                               |

## 28. 删除课件

`DELETE /live/liveInfo/deleteCourseware`

需要 JWT。请求体 `{ "id": "课件ID" }`。**响应 data：** `null`（`{ code: 1000 }` 即成功）

## 附：房间数据结构

```json
{
  "room_id": "string",
  "title": "string",
  "speaker_name": "string",
  "join_code": "string",
  "status": 1,
  "type": 0,
  "start_time": "string",
  "teacher_code": "string",
  "student_code": "string",
  "duration": 0,
  "live_started_at": "string",
  "live_user_id": "string"
}
```
