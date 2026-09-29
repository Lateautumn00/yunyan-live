# live-service 接口（gRPC）

服务：`apps/live-service`，端口 **50052**，协议包 `live.proto`（`package live`），服务名 `LiveService`。

内部服务仅供 Gateway 通过 gRPC 调用，不对外暴露 HTTP。部分 RPC 需要 gRPC metadata `user-id`（Gateway 鉴权后注入当前用户 ID）。

## 通用说明

- 成功响应 `code === "0"`。
- 需要 metadata 的 RPC：`CreateLive`、`CmsList`、`GetStudentRooms`、`LeaveRoom`、`BatchLeave`。

## 消息结构

### RoomData

| 字段            | 类型   | 说明                         |
| --------------- | ------ | ---------------------------- |
| room_id         | string | 房间 ID                      |
| title           | string | 标题                         |
| speaker_name    | string | 主播名                       |
| join_code       | string | 参加码                       |
| status          | int32  | 0=未开播，1=直播中，2=已结束 |
| type            | int32  | 直播类型                     |
| start_time      | string | 开始时间                     |
| teacher_code    | string | 老师码                       |
| student_code    | string | 学生码                       |
| duration        | int32  | 时长（秒）                   |
| live_started_at | string | 开播时间                     |
| live_user_id    | string | 主播用户 ID                  |

### LiveResponse / RoomResponse

| 字段 | 类型     | 说明       |
| ---- | -------- | ---------- |
| code | string   | `"0"` 成功 |
| msg  | string   | 提示信息   |
| data | RoomData | 房间数据   |

### CommonResponse

| 字段 | 类型   | 说明       |
| ---- | ------ | ---------- |
| code | string | `"0"` 成功 |
| msg  | string | 提示信息   |

### CoursewareItem / CoursewareListResponse

| 字段       | 类型   | 说明                          |
| ---------- | ------ | ----------------------------- |
| id         | string | 课件 ID                       |
| room_id    | string | 房间 ID                       |
| filename   | string | 文件名（不含扩展名）          |
| filext     | string | 扩展名，如 `pptx`             |
| filesize   | int64  | 文件字节数                    |
| fileurl    | string | 转换后 PDF 地址（去重关联键） |
| created_at | string | 创建时间（ISO8601）           |

`CoursewareListResponse`：`code` / `msg` / `data.items`（repeated CoursewareItem，按 created_at 升序）/ `data.total`（int32）。

### CmsListResponse

| 字段       | 类型              | 说明     |
| ---------- | ----------------- | -------- |
| code       | string            | `"0"`    |
| msg        | string            | 提示信息 |
| data.items | repeated RoomData | 房间列表 |
| data.total | int32             | 总条数   |

### ParticipantsResponse

| 字段       | 类型                 | 说明                           |
| ---------- | -------------------- | ------------------------------ |
| code       | string               | `"0"`                          |
| msg        | string               | 提示信息                       |
| data.items | repeated Participant | `user_id, username, joined_at` |
| data.total | int32                | 参与者数量                     |

### UpdateCodeResponse

| 字段      | 类型   | 说明     |
| --------- | ------ | -------- |
| code      | string | `"0"`    |
| msg       | string | 提示信息 |
| join_code | string | 新参加码 |

### GenerateTransferCodeResponse

| 字段          | 类型   | 说明     |
| ------------- | ------ | -------- |
| code          | string | `"0"`    |
| msg           | string | 提示信息 |
| transfer_code | string | 转移码   |
| expires_at    | string | 过期时间 |

### VideoListResponse

| 字段       | 类型                   | 说明                                                    |
| ---------- | ---------------------- | ------------------------------------------------------- |
| code       | string                 | `"0"`                                                   |
| msg        | string                 | 提示信息                                                |
| data.items | repeated VideoListItem | `room_id, title, teacher_name, type, start_time, count` |
| data.total | int32                  | 总条数                                                  |

### VideoDetailResponse

| 字段       | 类型                     | 说明                                                                                            |
| ---------- | ------------------------ | ----------------------------------------------------------------------------------------------- |
| code       | string                   | `"0"`                                                                                           |
| msg        | string                   | 提示信息                                                                                        |
| data.items | repeated VideoDetailItem | `id, room_id, file_path, file_name, file_size, duration, record_type, teacher_name, created_at` |
| data.total | int32                    | 总条数                                                                                          |

### WatchTimeListData

| 字段               | 类型                   | 说明                                                           |
| ------------------ | ---------------------- | -------------------------------------------------------------- |
| items              | repeated WatchTimeItem | `user_id, username, watch_time, joined_at, left_at, is_online` |
| total              | int32                  | 总条数                                                         |
| total_time_by_room | int32                  | 房间总观看时长                                                 |

## RPC 列表

### 1. CreateLive

`rpc CreateLive (CreateLiveRequest) returns (LiveResponse)`

需要 metadata `user-id`（主播）。

**请求：**

| 字段         | 类型   | 说明                      |
| ------------ | ------ | ------------------------- |
| title        | string | 标题                      |
| type         | int32  | 直播类型                  |
| duration     | int32  | 时长（秒）                |
| live_user_id | string | 主播用户 ID               |
| start_time   | string | 开始时间                  |
| room_id      | string | 复用房间 ID（空串则新建） |

### 2. JoinLive

`rpc JoinLive (JoinLiveRequest) returns (JoinLiveResponse)`

**请求：**

| 字段         | 类型   | 说明          |
| ------------ | ------ | ------------- |
| join_code    | string | 房间参加码    |
| live_user_id | string | 加入者用户 ID |

**响应 JoinLiveResponse：** `code, msg, data`（含 `live_user_id, room_id, role_name, join_code, live_type, status`）。

### 3. ShowRoom

`rpc ShowRoom (ShowRoomRequest) returns (RoomResponse)`

**请求：** `room_id`。

### 4. ChangeStatus

`rpc ChangeStatus (ChangeStatusRequest) returns (LiveResponse)`

**请求：**

| 字段    | 类型   | 说明    |
| ------- | ------ | ------- |
| room_id | string | 房间 ID |
| status  | int32  | 0/1/2   |

### 5. CmsList

`rpc CmsList (CmsListRequest) returns (CmsListResponse)`

需要 metadata `user-id`。

**请求：**

| 字段         | 类型   | 说明                  |
| ------------ | ------ | --------------------- |
| page         | int32  | 页码                  |
| page_size    | int32  | 每页数量              |
| status       | int32  | 状态过滤              |
| live_user_id | string | 主播用户 ID           |
| search_name  | string | 标题模糊搜索          |
| start_time   | string | 开始时间              |
| end_time     | string | 结束时间              |
| type         | int32  | 直播类型（-1 不过滤） |

### 6. CmsDetail

`rpc CmsDetail (CmsDetailRequest) returns (RoomResponse)`

**请求：** `room_id`。

### 7. DeleteLive

`rpc DeleteLive (DeleteLiveRequest) returns (CommonResponse)`

**请求：** `room_id`。

### 8. UpdateCode

`rpc UpdateCode (UpdateCodeRequest) returns (UpdateCodeResponse)`

**请求：** `room_id`。

### 9. UpdateLive

`rpc UpdateLive (UpdateLiveRequest) returns (LiveResponse)`

**请求：**

| 字段       | 类型   | 说明       |
| ---------- | ------ | ---------- |
| room_id    | string | 房间 ID    |
| title      | string | 标题       |
| type       | int32  | 直播类型   |
| start_time | string | 开始时间   |
| duration   | int32  | 时长（秒） |

### 10. GetStudentRooms

`rpc GetStudentRooms (GetStudentRoomsRequest) returns (StudentRoomsResponse)`

需要 metadata `user-id`（参与者）。

**请求：** `page, page_size`。

**响应 StudentRoomsResponse：** `data.items + data.total`。

### 11. LeaveRoom

`rpc LeaveRoom (LeaveRoomRequest) returns (CommonResponse)`

需要 metadata `user-id`。

**请求：** `room_id`。

### 12. BatchLeave

`rpc BatchLeave (BatchLeaveRequest) returns (BatchLeaveResponse)`

需要 metadata `user-id`。

**请求：** `room_ids`（repeated string）。

### 13. GetParticipants

`rpc GetParticipants (GetParticipantsRequest) returns (ParticipantsResponse)`

**请求：** `room_id`。

### 14. GenerateTransferCode

`rpc GenerateTransferCode (GenerateTransferCodeRequest) returns (GenerateTransferCodeResponse)`

**请求：**

| 字段           | 类型   | 说明            |
| -------------- | ------ | --------------- |
| room_id        | string | 房间 ID         |
| target_user_id | string | 目标接收用户 ID |

### 15. ExecuteTransfer

`rpc ExecuteTransfer (ExecuteTransferRequest) returns (CommonResponse)`

**请求：**

| 字段          | 类型   | 说明        |
| ------------- | ------ | ----------- |
| room_id       | string | 房间 ID     |
| transfer_code | string | 转移码      |
| from_user_id  | string | 转出用户 ID |

### 16. SaveVideoRecording

`rpc SaveVideoRecording (SaveVideoRecordingRequest) returns (CommonResponse)`

**请求：**

| 字段         | 类型   | 说明               |
| ------------ | ------ | ------------------ |
| room_id      | string | 房间 ID            |
| file_path    | string | 文件路径           |
| file_name    | string | 文件名             |
| file_size    | int64  | 文件大小           |
| duration     | int32  | 时长（秒）         |
| record_type  | int32  | 1=直播录制，2=回放 |
| teacher_name | string | 老师名             |

### 17. GetVideoList

`rpc GetVideoList (GetVideoListRequest) returns (VideoListResponse)`

**请求：** `page, page_size, live_user_id, search_name, start_time, end_time, type`。

### 18. GetVideoDetail

`rpc GetVideoDetail (GetVideoDetailRequest) returns (VideoDetailResponse)`

**请求：** `room_id, start_time, end_time`。

### 19. DeleteVideoByRoomIds

`rpc DeleteVideoByRoomIds (DeleteVideoByRoomIdsRequest) returns (CommonResponse)`

**请求：** `room_ids`（repeated string）。

### 20. DeleteVideoByVideoIds

`rpc DeleteVideoByVideoIds (DeleteVideoByVideoIdsRequest) returns (CommonResponse)`

**请求：** `video_ids`（repeated string）。

### 21. GetUserWatchTimeList

`rpc GetUserWatchTimeList (GetUserWatchTimeListRequest) returns (GetUserWatchTimeListResponse)`

**请求：** `page, page_size, room_id, search_name`。

**响应**：`data.items/watch_time` 为服务端按 `left_at - joined_at` 计算的秒数；`total_time_by_room` 为房间总时长。

### 22. SaveCourseware

`rpc SaveCourseware (SaveCoursewareRequest) returns (CommonResponse)`

**请求：** `room_id, filename, filext, filesize, fileurl, create_user_id`（create_user_id 由 Gateway 从 JWT 注入 gRPC metadata `user-id`）。

### 23. ListCourseware

`rpc ListCourseware (ListCoursewareRequest) returns (CoursewareListResponse)`

**请求：** `room_id`。**响应**：`data.items` 按 `created_at` 升序，供教师端进房自动导入课件。

### 24. DeleteCourseware

`rpc DeleteCourseware (DeleteCoursewareRequest) returns (CommonResponse)`

**请求：** `id`（课件 ID）。
